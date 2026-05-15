// server/lib/imageSanitiser.js
//
// Single-entry point for every image that arrives via an upload route.
// Does two things, in this order:
//
//   1. Transcode HEIC / HEIF (Apple's default camera format) to JPEG.
//      Browsers can't render HEIC natively as <img>, and HEIC isn't in
//      our accepted MIME allow-list for display, so we normalise it to
//      JPEG server-side before storage.
//
//   2. Strip EXIF / XMP / IPTC metadata from the result. Phone cameras
//      embed GPS coordinates by default; a homeowner photographing
//      their front door leaks lat/long unless we scrub it. Our public
//      Privacy Policy promises we strip this metadata, so the code
//      must actually do it.
//
// Two public helpers:
//
//   processBuffer({ buffer, mimetype, originalname })
//     -> { buffer, mimetype, originalname }
//     For routes that use multer.memoryStorage() (R2 flows).
//
//   processFile({ filePath, mimetype, originalname, filename? })
//     -> { filePath, mimetype, originalname, filename }
//     For routes that use multer.diskStorage() (local-disk flows).
//     If the input was HEIC, the file is replaced on disk with a .jpg
//     version and the returned filePath / filename reflect that. The
//     caller must use the returned values when storing the URL.
//
// Both helpers are non-throwing: if sharp can't decode a file, we
// return the original inputs rather than failing the upload. Better to
// keep the image than break the user.

const fs = require("node:fs/promises");
const path = require("node:path");
const { logger } = require("./logger");

// sharp is lazy-required so unit tests that don't touch uploads don't
// need to load the native binaries.
let _sharp = null;
function getSharp() {
  if (_sharp !== null) return _sharp;
  try {
    _sharp = require("sharp");
  } catch (e) {
    logger.warn(
      { err: e?.message || String(e) },
      "[imageSanitiser] sharp unavailable - skipping normalisation",
    );
    _sharp = false;
  }
  return _sharp || null;
}

// Sharp's prebuilt libvips binaries list HEIF as a format but omit the
// HEVC decoder (licensing), so sharp alone CAN'T open iPhone HEIC files.
// heic-convert is a pure-JS decoder that handles these reliably. We
// decode with heic-convert, then hand the resulting JPEG buffer to
// sharp for the EXIF-strip + rotate pass.
let _heicConvert = null;
function getHeicConvert() {
  if (_heicConvert !== null) return _heicConvert;
  try {
    _heicConvert = require("heic-convert");
  } catch (e) {
    logger.warn(
      { err: e?.message || String(e) },
      "[imageSanitiser] heic-convert unavailable - HEIC uploads will be stored as-is",
    );
    _heicConvert = false;
  }
  return _heicConvert || null;
}

/**
 * Decode a HEIC/HEIF buffer into a raw JPEG buffer via heic-convert.
 * Returns null if the library is unavailable or decode fails - the
 * caller must then fall back to passing the original bytes through.
 */
async function heicToJpeg(buffer) {
  const heicConvert = getHeicConvert();
  if (!heicConvert) return null;
  try {
    const ab = await heicConvert({
      buffer,
      format: "JPEG",
      quality: 0.88,
    });
    return Buffer.from(ab);
  } catch (e) {
    logger.warn(
      { err: e?.message || String(e) },
      "[imageSanitiser] heicToJpeg failed",
    );
    return null;
  }
}

const HEIC_MIME_RE = /^image\/(heic|heif)$/i;
const HEIC_EXT_RE = /\.(heic|heif)$/i;
const GIF_MIME_RE = /^image\/gif$/i;

function swapExtension(name, newExt) {
  if (!name) return name;
  const base = path.basename(name, path.extname(name));
  const dir = path.dirname(name);
  return dir && dir !== "." ? path.join(dir, base + newExt) : base + newExt;
}

/**
 * @param {{ buffer: Buffer, mimetype?: string, originalname?: string }} opts
 * @returns {Promise<{ buffer: Buffer, mimetype: string, originalname: string }>}
 */
async function processBuffer({ buffer, mimetype = "", originalname = "" }) {
  const result = {
    buffer,
    mimetype: String(mimetype || ""),
    originalname: String(originalname || ""),
  };

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return result;
  if (GIF_MIME_RE.test(result.mimetype)) return result;

  const sharp = getSharp();
  if (!sharp) return result;

  const isHeic =
    HEIC_MIME_RE.test(result.mimetype) || HEIC_EXT_RE.test(result.originalname);

  try {
    // For HEIC, decode with heic-convert first (sharp's libvips lacks
    // the HEVC decoder). The decoded buffer is JPEG, so the sharp pass
    // below produces a final JPEG. For other formats we run sharp
    // directly and preserve the input format (PNG stays PNG etc.) -
    // no format forcing.
    let bufferForSharp = buffer;
    if (isHeic) {
      const decoded = await heicToJpeg(buffer);
      if (!decoded) {
        // Decoder unavailable or failed - return the original HEIC
        // rather than breaking the upload. Caller can still store it;
        // browsers won't render it, but we don't lose the data.
        return result;
      }
      bufferForSharp = decoded;
    }

    let pipeline = sharp(bufferForSharp, { failOn: "none" }).rotate();
    if (isHeic) {
      // Explicit JPEG encoding for HEIC so the output is uniformly .jpg.
      pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });
    }
    // No withMetadata() -> all EXIF/XMP/IPTC dropped regardless.
    const out = await pipeline.toBuffer();

    return {
      buffer: out,
      mimetype: isHeic ? "image/jpeg" : result.mimetype,
      originalname: isHeic
        ? swapExtension(result.originalname, ".jpg")
        : result.originalname,
    };
  } catch (err) {
    logger.warn(
      {
        err: err?.message || String(err),
        mimetype: result.mimetype,
        originalname: result.originalname,
        size: buffer.length,
      },
      "[imageSanitiser] processBuffer failed, passing original",
    );
    return result;
  }
}

/**
 * @param {{ filePath: string, mimetype?: string, originalname?: string, filename?: string }} opts
 * @returns {Promise<{ filePath: string, mimetype: string, originalname: string, filename: string }>}
 */
async function processFile({
  filePath,
  mimetype = "",
  originalname = "",
  filename = "",
}) {
  const result = {
    filePath: String(filePath || ""),
    mimetype: String(mimetype || ""),
    originalname: String(originalname || ""),
    filename: String(filename || path.basename(filePath || "")),
  };

  if (!result.filePath) return result;
  if (GIF_MIME_RE.test(result.mimetype)) return result;

  const sharp = getSharp();
  if (!sharp) return result;

  const isHeic =
    HEIC_MIME_RE.test(result.mimetype) || HEIC_EXT_RE.test(result.filePath);

  try {
    const original = await fs.readFile(result.filePath);

    // For HEIC, decode via heic-convert first (sharp's libvips lacks
    // HEVC). Decoded buffer is JPEG-encoded, which sharp handles
    // natively. Non-HEIC inputs go straight to sharp.
    let bufferForSharp = original;
    if (isHeic) {
      const decoded = await heicToJpeg(original);
      if (!decoded) {
        // Decoder unavailable - leave file as-is.
        return result;
      }
      bufferForSharp = decoded;
    }

    let pipeline = sharp(bufferForSharp, { failOn: "none" }).rotate();
    if (isHeic) {
      pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });
    }
    const cleaned = await pipeline.toBuffer();

    if (isHeic) {
      // Rewrite to a .jpg path next to the original, then remove the
      // .heic file. filePath, filename and originalname all updated so
      // callers can store the correct URL.
      const newFilePath = swapExtension(result.filePath, ".jpg");
      const newFilename = swapExtension(result.filename, ".jpg");
      const newOriginalname = swapExtension(result.originalname, ".jpg");
      await fs.writeFile(newFilePath, cleaned);
      if (newFilePath !== result.filePath) {
        await fs.unlink(result.filePath).catch(() => {});
      }
      return {
        filePath: newFilePath,
        mimetype: "image/jpeg",
        originalname: newOriginalname,
        filename: newFilename,
      };
    }

    await fs.writeFile(result.filePath, cleaned);
    return result;
  } catch (err) {
    logger.warn(
      {
        err: err?.message || String(err),
        filePath: result.filePath,
        mimetype: result.mimetype,
      },
      "[imageSanitiser] processFile failed, leaving file as-is",
    );
    return result;
  }
}

module.exports = {
  processBuffer,
  processFile,
};
