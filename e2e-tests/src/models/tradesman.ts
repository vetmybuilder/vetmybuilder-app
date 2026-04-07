import Chance from "chance";
import path from "path";

const chance = new Chance();

export type TradesmanInput = {
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  tradeTypes?: string;
  serviceAreas?: string;
  website?: string;

  // supported by PUT /api/tradesmen/me via body.photoUrls
  photoUrls?: string[];
  profilePictureUrl?: string | null;
};

// POST /api/tradesmen/join (no auth)
export type TradesmanJoinOffer = {
  discountMin?: number;
  discountMax?: number;
  warranty?: "none" | "3m" | "6m" | "12m" | "24m+";
};

export type TradesmanJoinInput = {
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  tradeTypes?: string;
  serviceAreas?: string;

  websites?: string[];
  docs?: string[];
  workPhotos?: string[];

  offer?: TradesmanJoinOffer;

  likesCount?: number;
  winsCount?: number;
};

type MultipartPhoto = {
  filePath: string;
};

export default class Tradesman {
  companyName!: string;
  contactName?: string;
  email?: string;
  phone?: string;
  tradeTypes?: string;
  serviceAreas?: string;
  website?: string;

  photoUrls?: string[];
  profilePictureUrl?: string | null;

  // Registration-only fields used by the /tradesman/register-tradesmen wizard.
  // Not part of any API payload.
  password?: string;
  primaryTradeLabel?: string;
  serviceAreaPostcode?: string;

  // join route fields
  websites: string[] = [];
  docs: string[] = [];
  workPhotos: string[] = [];
  offer?: TradesmanJoinOffer;
  likesCount?: number;
  winsCount?: number;

  private photos: MultipartPhoto[] = [];

  static aTradesman(): Tradesman {
    return new Tradesman();
  }

  withRandomDetails(): Tradesman {
    this.companyName = `${chance.company()} Ltd`;
    this.contactName = chance.name();
    this.email = `tm-${chance.string({
      length: 8,
      alpha: true,
      casing: "lower",
    })}@test.com`;
    this.phone = "07123456789";
    this.tradeTypes = "plumbing";
    this.serviceAreas = "London";
    this.website = "https://example.com";
    return this;
  }

  /**
   * Populate the fields needed to walk through the
   * /tradesman/register-tradesmen wizard end-to-end. Mirrors
   * Account.withRandomRegistration() on the homeowner side.
   */
  withRandomRegistration(opts?: {
    password?: string;
    primaryTradeLabel?: string;
    serviceAreaPostcode?: string;
    emailDomain?: string;
  }): Tradesman {
    const tag = chance.string({
      length: 8,
      alpha: true,
      casing: "lower",
    });
    const domain = opts?.emailDomain ?? "test.com";

    this.companyName = `E2E Reg Builder ${tag} Ltd`;
    this.contactName = "E2E Reg Builder";
    this.email = `e2e-reg-${tag}@${domain}`;
    this.password = opts?.password ?? "Passw0rd!";
    this.primaryTradeLabel = opts?.primaryTradeLabel ?? "General Builder";
    this.serviceAreaPostcode = opts?.serviceAreaPostcode ?? "SW1A 1AA";
    return this;
  }

  get requiredEmail(): string {
    if (!this.email) throw new Error("Tradesman.email is required");
    return this.email;
  }

  get requiredPassword(): string {
    if (!this.password) throw new Error("Tradesman.password is required");
    return this.password;
  }

  get requiredPrimaryTradeLabel(): string {
    if (!this.primaryTradeLabel)
      throw new Error("Tradesman.primaryTradeLabel is required");
    return this.primaryTradeLabel;
  }

  get requiredServiceAreaPostcode(): string {
    if (!this.serviceAreaPostcode)
      throw new Error("Tradesman.serviceAreaPostcode is required");
    return this.serviceAreaPostcode;
  }

  withCompanyName(companyName: string): Tradesman {
    this.companyName = companyName;
    return this;
  }

  withProfilePictureUrl(url: string | null): Tradesman {
    this.profilePictureUrl = url;
    return this;
  }

  withPhotoUrls(urls: string[]): Tradesman {
    this.photoUrls = Array.isArray(urls)
      ? urls.filter(Boolean).map(String)
      : [];
    return this;
  }

  withPhotos(count: number): Tradesman {
    const fixturesDir = path.resolve(__dirname, "../files");

    for (let i = 0; i < count; i++) {
      const n = i + 1;
      this.photos.push({
        filePath: path.join(fixturesDir, `photo${n}.jpg`),
      });
    }

    return this;
  }

  // ---- join route helpers ----
  withWebsites(websites: string[]): Tradesman {
    this.websites = Array.isArray(websites)
      ? websites.filter(Boolean).map(String)
      : [];
    return this;
  }

  withDocs(countOrDocs: number | string[]): Tradesman {
    if (Array.isArray(countOrDocs)) {
      this.docs = countOrDocs.filter(Boolean).map(String);
      return this;
    }

    const n = Math.max(0, Number(countOrDocs) || 0);
    this.docs = Array.from({ length: n }).map((_, i) => `doc-${i + 1}.pdf`);
    return this;
  }

  withWorkPhotos(countOrUrls: number | string[]): Tradesman {
    if (Array.isArray(countOrUrls)) {
      this.workPhotos = countOrUrls.filter(Boolean).map(String);
      return this;
    }

    const n = Math.max(0, Number(countOrUrls) || 0);
    this.workPhotos = Array.from({ length: n }).map(
      (_, i) => `/uploads/tradesmen/lead_photo_${i + 1}.jpg`
    );
    return this;
  }

  withOffer(offer: TradesmanJoinOffer): Tradesman {
    this.offer = offer || undefined;
    return this;
  }

  withLikesCount(likesCount: number): Tradesman {
    this.likesCount = Number.isFinite(Number(likesCount))
      ? Number(likesCount)
      : 0;
    return this;
  }

  withWinsCount(winsCount: number): Tradesman {
    this.winsCount = Number.isFinite(Number(winsCount)) ? Number(winsCount) : 0;
    return this;
  }

  // ---- payloads ----
  toPayload(): TradesmanInput {
    const out: TradesmanInput = {
      companyName: this.companyName,
    };

    if (this.contactName) out.contactName = this.contactName;
    if (this.email) out.email = this.email;
    if (this.phone) out.phone = this.phone;
    if (this.tradeTypes) out.tradeTypes = this.tradeTypes;
    if (this.serviceAreas) out.serviceAreas = this.serviceAreas;
    if (this.website) out.website = this.website;

    if (this.photoUrls?.length) out.photoUrls = this.photoUrls;
    if (this.profilePictureUrl !== undefined)
      out.profilePictureUrl = this.profilePictureUrl;

    return out;
  }

  toJoinPayload(): TradesmanJoinInput {
    const out: TradesmanJoinInput = {
      companyName: this.companyName,
    };

    if (this.contactName) out.contactName = this.contactName;
    if (this.email) out.email = this.email;
    if (this.phone) out.phone = this.phone;
    if (this.tradeTypes) out.tradeTypes = this.tradeTypes;
    if (this.serviceAreas) out.serviceAreas = this.serviceAreas;

    const websites = this.websites?.length
      ? this.websites
      : this.website
      ? [this.website]
      : [];

    if (websites.length) out.websites = websites;
    if (this.docs?.length) out.docs = this.docs;
    if (this.workPhotos?.length) out.workPhotos = this.workPhotos;
    if (this.offer) out.offer = this.offer;

    if (this.likesCount !== undefined) out.likesCount = this.likesCount;
    if (this.winsCount !== undefined) out.winsCount = this.winsCount;

    return out;
  }

  toPhotosMultipartPayload(): {
    fields: Record<string, any>;
    photos?: string[];
  } {
    return {
      fields: {},
      photos: this.photos.length
        ? this.photos.map((p) => p.filePath)
        : undefined,
    };
  }
}
