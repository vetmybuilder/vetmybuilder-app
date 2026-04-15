import { describe, it, expect } from "vitest";
import sharp from "sharp";

// The module is CommonJS; require it at the top level.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  processBuffer,
} = require("../../server/lib/imageSanitiser");

/**
 * Build a small red JPEG with an embedded EXIF block that includes
 * GPS coordinates. If the sanitiser does its job the GPS block won't
 * appear in the output buffer.
 *
 * We use sharp itself to build the fixture so the test doesn't depend
 * on any binary blob in the repo.
 */
async function jpegWithGps(): Promise<Buffer> {
  return await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .withMetadata({
      exif: {
        IFD0: { Software: "test" },
        GPS: {
          GPSLatitudeRef: "N",
          GPSLatitude: "51/1,30/1,0/1",
          GPSLongitudeRef: "W",
          GPSLongitude: "0/1,10/1,0/1",
        },
      },
    })
    .jpeg()
    .toBuffer();
}

async function readMetadata(buffer: Buffer) {
  return await sharp(buffer).metadata();
}

describe("imageSanitiser.processBuffer", () => {
  it("strips EXIF (and GPS) from a JPEG", async () => {
    const input = await jpegWithGps();

    const inMeta = await readMetadata(input);
    expect(inMeta.exif).toBeInstanceOf(Buffer);
    expect(inMeta.exif && inMeta.exif.length).toBeGreaterThan(0);

    const { buffer: out, mimetype, originalname } = await processBuffer({
      buffer: input,
      mimetype: "image/jpeg",
      originalname: "IMG_1234.jpg",
    });

    const outMeta = await readMetadata(out);
    // After sanitisation there should be no EXIF block at all - the
    // strongest possible guarantee that GPS tags are gone.
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.width).toBe(8);
    expect(outMeta.height).toBe(8);
    // JPEG input stays JPEG (no transcode).
    expect(mimetype).toBe("image/jpeg");
    expect(originalname).toBe("IMG_1234.jpg");
  });

  it("transcodes a HEIC buffer to JPEG and renames the file", async () => {
    // Build a real HEIC buffer with sharp so the test doesn't rely on
    // a binary fixture. Requires libvips compiled with HEIF support,
    // which sharp 0.34+ ships by default.
    let heicInput: Buffer;
    try {
      heicInput = await sharp({
        create: {
          width: 16,
          height: 16,
          channels: 3,
          background: { r: 100, g: 100, b: 100 },
        },
      })
        .heif({ compression: "hevc", quality: 70 })
        .toBuffer();
    } catch (e) {
      // Some CI environments ship libvips without HEIF encode support.
      // In that case skip this test rather than fail it - the
      // production code path is exercised by routes/e2e tests.
      console.warn("skipping HEIC transcode test - heif encoder unavailable:", e);
      return;
    }

    const { buffer, mimetype, originalname } = await processBuffer({
      buffer: heicInput,
      mimetype: "image/heic",
      originalname: "IMG_1324.HEIC",
    });

    // Output should be JPEG - check magic bytes (FF D8 FF)
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
    expect(buffer[2]).toBe(0xff);
    expect(mimetype).toBe("image/jpeg");
    expect(originalname).toBe("IMG_1324.jpg");

    // Dimensions preserved.
    const outMeta = await readMetadata(buffer);
    expect(outMeta.format).toBe("jpeg");
    expect(outMeta.width).toBe(16);
    expect(outMeta.height).toBe(16);
    expect(outMeta.exif).toBeUndefined();
  });

  it("passes GIFs through untouched", async () => {
    const input = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .gif()
      .toBuffer();

    const { buffer } = await processBuffer({
      buffer: input,
      mimetype: "image/gif",
      originalname: "pic.gif",
    });

    expect(buffer.equals(input)).toBe(true);
  });

  it("returns the original buffer when decode fails (non-image bytes)", async () => {
    const garbage = Buffer.from("not an image");
    const { buffer } = await processBuffer({
      buffer: garbage,
      mimetype: "image/jpeg",
      originalname: "bad.jpg",
    });
    expect(buffer.equals(garbage)).toBe(true);
  });

  it("no-ops on empty input", async () => {
    const { buffer } = await processBuffer({
      buffer: Buffer.alloc(0),
      mimetype: "image/jpeg",
      originalname: "empty.jpg",
    });
    expect(buffer.length).toBe(0);
  });
});
