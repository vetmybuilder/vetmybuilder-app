import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import LightboxGallery, { type GalleryImage } from "../../../web/components/LightboxGallery";

const IMAGES: GalleryImage[] = [
  { id: 1, thumbUrl: "/thumb1.jpg", fullUrl: "/full1.jpg", alt: "Image one" },
  { id: 2, thumbUrl: "/thumb2.jpg", fullUrl: "/full2.jpg", alt: "Image two" },
  { id: 3, thumbUrl: "/thumb3.jpg", fullUrl: "/full3.jpg", alt: "Image three" },
];

function openLightbox(index = 0) {
  const buttons = screen.getAllByRole("button", { name: /open image/i });
  fireEvent.click(buttons[index]);
}

describe("<LightboxGallery />", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("renders a thumbnail button for each image", () => {
    render(<LightboxGallery images={IMAGES} />);
    expect(screen.getAllByRole("button", { name: /open image/i })).toHaveLength(IMAGES.length);
  });

  it("does not show the lightbox initially", () => {
    render(<LightboxGallery images={IMAGES} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows no photos message when images array is empty", () => {
    render(<LightboxGallery images={[]} />);
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument();
  });

  describe("when a thumbnail is clicked", () => {
    beforeEach(() => {
      render(<LightboxGallery images={IMAGES} />);
      openLightbox(0);
    });

    it("opens the lightbox dialog", () => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("displays the correct full-size image", () => {
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByAltText("Image one")).toBeInTheDocument();
    });

    it("shows the correct counter", () => {
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    it("locks body scroll", () => {
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("closes when the Close button is clicked", () => {
      fireEvent.click(screen.getByRole("button", { name: /close/i }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes when the backdrop is clicked", () => {
      // The click-to-close handler is on the image area div, not the dialog root
      const dialog = screen.getByRole("dialog");
      const imageArea = dialog.querySelector(".flex-1") as HTMLElement;
      fireEvent.click(imageArea);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes when Escape is pressed", () => {
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("restores body scroll after closing", () => {
      fireEvent.click(screen.getByRole("button", { name: /close/i }));
      expect(document.body.style.overflow).toBe("");
    });
  });

  describe("navigation", () => {
    beforeEach(() => {
      render(<LightboxGallery images={IMAGES} />);
      openLightbox(0);
    });

    it("goes to the next image when Next is clicked", () => {
      fireEvent.click(screen.getByRole("button", { name: /next image/i }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByAltText("Image two")).toBeInTheDocument();
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });

    it("goes to the previous image when Prev is clicked", () => {
      fireEvent.click(screen.getByRole("button", { name: /previous image/i }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByAltText("Image three")).toBeInTheDocument();
      expect(screen.getByText("3 / 3")).toBeInTheDocument();
    });

    it("navigates forward with ArrowRight key", () => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByAltText("Image two")).toBeInTheDocument();
    });

    it("navigates backward with ArrowLeft key", () => {
      fireEvent.keyDown(window, { key: "ArrowLeft" });
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByAltText("Image three")).toBeInTheDocument();
    });

    it("wraps from last image to first on Next", () => {
      fireEvent.click(screen.getByRole("button", { name: /next image/i }));
      fireEvent.click(screen.getByRole("button", { name: /next image/i }));
      fireEvent.click(screen.getByRole("button", { name: /next image/i }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByAltText("Image one")).toBeInTheDocument();
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    it("opens at the correct index when a non-first thumbnail is clicked", () => {
      fireEvent.click(screen.getByRole("button", { name: /close/i }));
      openLightbox(1);
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByAltText("Image two")).toBeInTheDocument();
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });
  });

  describe("single image", () => {
    it("does not render prev/next buttons when there is only one image", () => {
      render(<LightboxGallery images={[IMAGES[0]]} />);
      openLightbox(0);
      expect(screen.queryByRole("button", { name: /next image/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /previous image/i })).not.toBeInTheDocument();
    });
  });
});
