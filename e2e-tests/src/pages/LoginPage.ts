import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly createOneLink: Locator;


  constructor(page: Page) {
    this.page = page;
    this.createOneLink = page.getByRole('link', { name: 'Create one' })

  }

  async goto() {
    await this.page.goto('/login');
  }

}
