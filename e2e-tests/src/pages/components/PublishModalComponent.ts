import { expect, type Locator, type Page } from "@playwright/test";

export type PublishChannel = "whatsapp" | "sms" | "email" | null;

export type PublishOptions = {
  // keep your original naming
  askNeighbourhood?: boolean;

  channel?: PublishChannel;

  whatsapp?: boolean;
  sms?: boolean;
  email?: boolean;
};

export class PublishModalComponent {
  readonly page: Page;

  readonly dialog: Locator;
  readonly closeButton: Locator;

  readonly neighbourhoodToggle: Locator;
  readonly neighbourhoodLockedMessage: Locator;

  readonly channelWhatsapp: Locator;
  readonly channelSms: Locator;
  readonly channelEmail: Locator;

  readonly cancelButton: Locator;
  readonly confirmButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.dialog = page.getByTestId("get-recs-modal");
    this.closeButton = page.getByTestId("get-recs-close");

    this.neighbourhoodToggle = page.getByTestId("toggle-neighbourhood");
    this.neighbourhoodLockedMessage = page.getByTestId(
      "neighbourhood-locked-message",
    );

    this.channelWhatsapp = page.getByTestId("channel-whatsapp");
    this.channelSms = page.getByTestId("channel-sms");
    this.channelEmail = page.getByTestId("channel-email");

    this.cancelButton = page.getByTestId("btn-cancel-get-recs");
    this.confirmButton = page.getByTestId("btn-confirm-get-recs");
  }

  async assertVisible() {
    await expect(this.dialog).toBeVisible();
  }

  private resolveChannel(opts: PublishOptions): PublishChannel {
    if (opts.whatsapp) return "whatsapp";
    if (opts.sms) return "sms";
    if (opts.email) return "email";
    return opts.channel ?? null;
  }

  private async setNeighbourhoodEnabled(enabled: boolean) {
    // If locked, UI disables the button so just skip
    if (await this.neighbourhoodToggle.isDisabled()) return;

    const pressed = await this.neighbourhoodToggle.getAttribute("aria-pressed");
    const isEnabled = pressed === "true";

    if (isEnabled !== enabled) {
      await this.neighbourhoodToggle.click();
      await expect(this.neighbourhoodToggle).toHaveAttribute(
        "aria-pressed",
        enabled ? "true" : "false",
      );
    }
  }

  private async chooseChannel(channel: PublishChannel) {
    if (!channel) return;

    if (channel === "whatsapp") await this.channelWhatsapp.click();
    if (channel === "sms") await this.channelSms.click();
    if (channel === "email") await this.channelEmail.click();
  }

  async publish(options?: PublishOptions) {
    await this.assertVisible();

    const opts = options ?? {};

    // Neighbourhood (only if caller specified it)
    if (typeof opts.askNeighbourhood === "boolean") {
      await this.setNeighbourhoodEnabled(Boolean(opts.askNeighbourhood));
    }

    // Channel (optional)
    const channel = this.resolveChannel(opts);
    await this.chooseChannel(channel);

    // Confirm
    await this.confirmButton.click();

    // Modal should close
    await expect(this.dialog).toBeHidden();
  }

  async hasNeighbourhoodLocked(): Promise<void> {
    await expect(this.neighbourhoodLockedMessage).toBeVisible();
    await expect(this.neighbourhoodToggle).toBeDisabled();
  }

  async hasChannelSelected(channel: PublishChannel): Promise<void> {
    if (!channel) return;

    const selectedClasses: Record<NonNullable<PublishChannel>, RegExp> = {
      whatsapp: /border-emerald-500/,
      sms: /border-sky-500/,
      email: /border-indigo-500/,
    };

    const buttonMap: Record<NonNullable<PublishChannel>, Locator> = {
      whatsapp: this.channelWhatsapp,
      sms: this.channelSms,
      email: this.channelEmail,
    };

    await expect(buttonMap[channel]).toHaveClass(selectedClasses[channel]);
  }

  async close() {
    await this.closeButton.click();
    await expect(this.dialog).toBeHidden();
  }
}

export default PublishModalComponent;
