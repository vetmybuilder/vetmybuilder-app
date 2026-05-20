// tests/web/components/ContactLink.test.tsx
//
// Pins the empty-state wording on the public tradesperson profile.
//
// Background: /api/tradesmen/:id intentionally never returns phone /
// email (contact is gated behind a mutual swipe match). Before this
// fix the locked rows rendered "Not provided", which read as "the
// tradesperson hasn't filled it in". The override-able empty text
// keeps the default for genuinely-missing data (e.g. Website) while
// letting Phone / Email say "Available after a mutual match".

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ContactLink from "@/components/tradesman/ContactLink";

describe("<ContactLink />", () => {
  it("renders a tappable link when a value is supplied", () => {
    render(
      <ContactLink
        icon={<span>phone-icon</span>}
        value="07828989106"
        href="tel:07828989106"
        testId="contact-phone"
      />,
    );

    const link = screen.getByTestId("contact-phone");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "tel:07828989106");
    expect(link).toHaveTextContent("07828989106");
  });

  it("falls back to 'Not provided' when no value and no override is set", () => {
    render(
      <ContactLink
        icon={<span>globe-icon</span>}
        value={null}
        testId="contact-website"
      />,
    );

    expect(screen.getByTestId("contact-website")).toHaveTextContent(
      "Not provided",
    );
  });

  it("renders the custom empty text when value is locked behind a mutual match", () => {
    render(
      <ContactLink
        icon={<span>phone-icon</span>}
        value={null}
        testId="contact-phone"
        emptyText="Available after a mutual match"
      />,
    );

    const row = screen.getByTestId("contact-phone");
    expect(row).toHaveTextContent("Available after a mutual match");
    expect(row).not.toHaveTextContent("Not provided");
  });
});
