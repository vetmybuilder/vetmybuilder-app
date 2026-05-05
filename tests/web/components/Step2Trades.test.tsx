import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";

// Minimal trade types — avoids loading the full 200-entry list
vi.mock("@/types/tradeTypes", () => ({
  TRADE_TYPES: [
    { label: "Bricklayer", active: true, buckets: "Building", popularity: 2 },
    { label: "Electrician", active: true, buckets: "Electrical", popularity: 5 },
  ],
}));

// jsdom doesn't implement URL.createObjectURL / revokeObjectURL
beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn((f: File) => `blob:mock-${f.name}`),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
});

import Step2Trades from "../../../web/components/vendor-register/Step2Trades";

function makeFile(name = "photo.jpg"): File {
  return new File(["data"], name, { type: "image/jpeg" });
}

const base = {
  tradeTypes: [] as string[],
  setTradeTypes: vi.fn(),
  workPhotos: [] as File[],
  setWorkPhotos: vi.fn(),
  onBack: vi.fn(),
  onNext: vi.fn(),
};

describe("<Step2Trades /> — profile picture", () => {
  // The "always-visible profile-picture guidance copy" test was removed
  // when the wizard rebuild scoped that text to render only when there
  // are photos to choose from. The contextual copy is exercised by the
  // surrounding tests below (which render with existing photos).

  describe("auto-selection", () => {
    it("auto-selects the first existing photo when profilePictureKey is null", () => {
      const onProfilePictureKeyChange = vi.fn();
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={[
            "https://cdn.example.com/a.jpg",
            "https://cdn.example.com/b.jpg",
          ]}
          profilePictureKey={null}
          onProfilePictureKeyChange={onProfilePictureKeyChange}
        />
      );
      expect(onProfilePictureKeyChange).toHaveBeenCalledWith(
        "https://cdn.example.com/a.jpg"
      );
    });

    it("auto-selects 'new-0' when profilePictureKey is null and only new files exist", () => {
      const onProfilePictureKeyChange = vi.fn();
      render(
        <Step2Trades
          {...base}
          workPhotos={[makeFile("a.jpg")]}
          existingPhotoUrls={[]}
          profilePictureKey={null}
          onProfilePictureKeyChange={onProfilePictureKeyChange}
        />
      );
      expect(onProfilePictureKeyChange).toHaveBeenCalledWith("new-0");
    });

    it("prefers an existing photo over new files when both are present", () => {
      const onProfilePictureKeyChange = vi.fn();
      render(
        <Step2Trades
          {...base}
          workPhotos={[makeFile("new.jpg")]}
          existingPhotoUrls={["https://cdn.example.com/existing.jpg"]}
          profilePictureKey={null}
          onProfilePictureKeyChange={onProfilePictureKeyChange}
        />
      );
      expect(onProfilePictureKeyChange).toHaveBeenCalledWith(
        "https://cdn.example.com/existing.jpg"
      );
    });

    it("does not auto-select when profilePictureKey is already set", () => {
      const onProfilePictureKeyChange = vi.fn();
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={["https://cdn.example.com/a.jpg"]}
          profilePictureKey="https://cdn.example.com/a.jpg"
          onProfilePictureKeyChange={onProfilePictureKeyChange}
        />
      );
      expect(onProfilePictureKeyChange).not.toHaveBeenCalled();
    });

    it("does not auto-select when there are no photos at all", () => {
      const onProfilePictureKeyChange = vi.fn();
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={[]}
          profilePictureKey={null}
          onProfilePictureKeyChange={onProfilePictureKeyChange}
        />
      );
      expect(onProfilePictureKeyChange).not.toHaveBeenCalled();
    });

    it("does not auto-select when onProfilePictureKeyChange is not provided", () => {
      // Should render without errors and no key change attempted
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={["https://cdn.example.com/a.jpg"]}
          profilePictureKey={null}
        />
      );
      // No assertion needed — just confirming no crash
    });
  });

  describe("existing photos grid", () => {
    it("renders existing photos with selection buttons", () => {
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={[
            "https://cdn.example.com/a.jpg",
            "https://cdn.example.com/b.jpg",
          ]}
          profilePictureKey="https://cdn.example.com/a.jpg"
          onProfilePictureKeyChange={vi.fn()}
        />
      );
      expect(
        screen.getByRole("button", { name: /deselect as profile picture/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /set as profile picture/i })
      ).toBeInTheDocument();
      expect(screen.getByText("Profile")).toBeInTheDocument();
    });

    it("clicking an unselected existing photo calls onProfilePictureKeyChange with its URL", () => {
      const onProfilePictureKeyChange = vi.fn();
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={[
            "https://cdn.example.com/a.jpg",
            "https://cdn.example.com/b.jpg",
          ]}
          profilePictureKey="https://cdn.example.com/a.jpg"
          onProfilePictureKeyChange={onProfilePictureKeyChange}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /set as profile picture/i })
      );
      expect(onProfilePictureKeyChange).toHaveBeenCalledWith(
        "https://cdn.example.com/b.jpg"
      );
    });

    it("clicking the selected photo deselects it", () => {
      const onProfilePictureKeyChange = vi.fn();
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={["https://cdn.example.com/a.jpg"]}
          profilePictureKey="https://cdn.example.com/a.jpg"
          onProfilePictureKeyChange={onProfilePictureKeyChange}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /deselect as profile picture/i })
      );
      expect(onProfilePictureKeyChange).toHaveBeenCalledWith(null);
    });

    it("does not render existing photo grid when onProfilePictureKeyChange is not provided", () => {
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={["https://cdn.example.com/a.jpg"]}
        />
      );
      expect(
        screen.queryByRole("button", { name: /profile picture/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("photo removal", () => {
    it("shows Remove photo button on each existing photo when onRemoveExistingPhoto is provided", () => {
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={[
            "https://cdn.example.com/a.jpg",
            "https://cdn.example.com/b.jpg",
          ]}
          profilePictureKey="https://cdn.example.com/a.jpg"
          onProfilePictureKeyChange={vi.fn()}
          onRemoveExistingPhoto={vi.fn()}
        />
      );
      expect(screen.getAllByRole("button", { name: /remove photo/i })).toHaveLength(2);
    });

    it("does not show Remove photo button when onRemoveExistingPhoto is not provided", () => {
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={["https://cdn.example.com/a.jpg"]}
          profilePictureKey="https://cdn.example.com/a.jpg"
          onProfilePictureKeyChange={vi.fn()}
        />
      );
      expect(screen.queryByRole("button", { name: /remove photo/i })).not.toBeInTheDocument();
    });

    it("calls onRemoveExistingPhoto with the photo URL when Remove is clicked", () => {
      const onRemoveExistingPhoto = vi.fn();
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={[
            "https://cdn.example.com/a.jpg",
            "https://cdn.example.com/b.jpg",
          ]}
          profilePictureKey="https://cdn.example.com/a.jpg"
          onProfilePictureKeyChange={vi.fn()}
          onRemoveExistingPhoto={onRemoveExistingPhoto}
        />
      );
      const removeBtns = screen.getAllByRole("button", { name: /remove photo/i });
      fireEvent.click(removeBtns[1]); // click remove on second photo
      expect(onRemoveExistingPhoto).toHaveBeenCalledWith("https://cdn.example.com/b.jpg");
    });

    it("also deselects the profile picture when the selected photo is removed", () => {
      const onProfilePictureKeyChange = vi.fn();
      const onRemoveExistingPhoto = vi.fn();
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={["https://cdn.example.com/a.jpg"]}
          profilePictureKey="https://cdn.example.com/a.jpg"
          onProfilePictureKeyChange={onProfilePictureKeyChange}
          onRemoveExistingPhoto={onRemoveExistingPhoto}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /remove photo/i }));
      expect(onProfilePictureKeyChange).toHaveBeenCalledWith(null);
      expect(onRemoveExistingPhoto).toHaveBeenCalledWith("https://cdn.example.com/a.jpg");
    });

    it("does not call onProfilePictureKeyChange when a non-selected photo is removed", () => {
      const onProfilePictureKeyChange = vi.fn();
      render(
        <Step2Trades
          {...base}
          existingPhotoUrls={[
            "https://cdn.example.com/a.jpg",
            "https://cdn.example.com/b.jpg",
          ]}
          profilePictureKey="https://cdn.example.com/a.jpg"
          onProfilePictureKeyChange={onProfilePictureKeyChange}
          onRemoveExistingPhoto={vi.fn()}
        />
      );
      const removeBtns = screen.getAllByRole("button", { name: /remove photo/i });
      fireEvent.click(removeBtns[1]); // remove the non-selected photo
      expect(onProfilePictureKeyChange).not.toHaveBeenCalled();
    });
  });
});
