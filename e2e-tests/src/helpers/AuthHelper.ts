import { loginInAsHomeowner } from "../apiHelper/setupHomeownerSession";

export class AuthHelper {
  constructor(
    private request: any,
    private page: any,
    private runtime: any,
  ) {}

  async loginAsHomeowner(args: {
    firstName: string;
    lastName: string;
    location: string;
  }) {
    await loginInAsHomeowner({
      request: this.request,
      page: this.page,
      apiBaseUrl: this.runtime.apiBaseUrl,
      uiBaseUrl: this.runtime.webBaseUrl,
      ...args,
    });
  }
}
