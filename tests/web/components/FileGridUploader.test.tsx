import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import React from "react";
import FileGridUploader from "../../../web/components/fileUpload/FileGridUploader";

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

function makeFile(name = "photo.jpg"): File {
  return new File(["data"], name, { type: "image/jpeg" });
}

describe("<FileGridUploader />", () => {
  it("renders the upload drop zone", () => {
    render(<FileGridUploader files={[]} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /upload photos/i })
    ).toBeInTheDocument();
  });

  it("renders an img for each file", () => {
    const files = [makeFile("a.jpg"), makeFile("b.jpg")];
    render(<FileGridUploader files={files} onChange={vi.fn()} />);
    expect(screen.getByAltText("a.jpg")).toBeInTheDocument();
    expect(screen.getByAltText("b.jpg")).toBeInTheDocument();
  });

  it("calls onChange with the file removed when ✕ is clicked", () => {
    const files = [makeFile("a.jpg"), makeFile("b.jpg")];
    const onChange = vi.fn();
    render(<FileGridUploader files={files} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /remove a\.jpg/i }));
    expect(onChange).toHaveBeenCalledWith([files[1]]);
  });

  describe("profile picture selection", () => {
    it("shows 'Set as profile picture' when onProfilePictureKeyChange is provided", () => {
      render(
        <FileGridUploader
          files={[makeFile("a.jpg")]}
          onChange={vi.fn()}
          profilePictureKey={null}
          onProfilePictureKeyChange={vi.fn()}
        />
      );
      expect(
        screen.getByRole("button", { name: /set as profile picture/i })
      ).toBeInTheDocument();
    });

    it("clicking a photo calls onProfilePictureKeyChange with 'new-{i}'", () => {
      const files = [makeFile("a.jpg"), makeFile("b.jpg")];
      const onProfilePictureKeyChange = vi.fn();
      render(
        <FileGridUploader
          files={files}
          onChange={vi.fn()}
          profilePictureKey={null}
          onProfilePictureKeyChange={onProfilePictureKeyChange}
        />
      );
      const btns = screen.getAllByRole("button", {
        name: /set as profile picture/i,
      });
      fireEvent.click(btns[1]); // click second photo
      expect(onProfilePictureKeyChange).toHaveBeenCalledWith("new-1");
    });

    it("shows 'Profile' badge on the selected photo", () => {
      const files = [makeFile("a.jpg"), makeFile("b.jpg")];
      render(
        <FileGridUploader
          files={files}
          onChange={vi.fn()}
          profilePictureKey="new-1"
          onProfilePictureKeyChange={vi.fn()}
        />
      );
      expect(screen.getByText("Profile")).toBeInTheDocument();
      // Only the selected photo shows "Deselect"; the other shows "Set"
      expect(
        screen.getByRole("button", { name: /deselect as profile picture/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /set as profile picture/i })
      ).toBeInTheDocument();
    });

    it("clicking the selected photo calls onProfilePictureKeyChange with null", () => {
      const onProfilePictureKeyChange = vi.fn();
      render(
        <FileGridUploader
          files={[makeFile("a.jpg")]}
          onChange={vi.fn()}
          profilePictureKey="new-0"
          onProfilePictureKeyChange={onProfilePictureKeyChange}
        />
      );
      fireEvent.click(
        screen.getByRole("button", { name: /deselect as profile picture/i })
      );
      expect(onProfilePictureKeyChange).toHaveBeenCalledWith(null);
    });

    it("does not show selection buttons when onProfilePictureKeyChange is not provided", () => {
      render(
        <FileGridUploader
          files={[makeFile("a.jpg")]}
          onChange={vi.fn()}
        />
      );
      expect(
        screen.queryByRole("button", { name: /profile picture/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Profile")).not.toBeInTheDocument();
    });
  });

  describe("photo upload consent (Acceptable Use Policy)", () => {
    it("does NOT show the consent checkbox when there are no files", () => {
      render(<FileGridUploader files={[]} onChange={vi.fn()} />);
      expect(
        screen.queryByTestId("photo-consent-checkbox"),
      ).not.toBeInTheDocument();
    });

    it("shows the consent checkbox when at least one file is attached", () => {
      render(
        <FileGridUploader files={[makeFile("a.jpg")]} onChange={vi.fn()} />,
      );
      expect(
        screen.getByTestId("photo-consent-checkbox"),
      ).toBeInTheDocument();
    });

    it("does not show the checkbox when requireConsent is false", () => {
      render(
        <FileGridUploader
          files={[makeFile("a.jpg")]}
          onChange={vi.fn()}
          requireConsent={false}
        />,
      );
      expect(
        screen.queryByTestId("photo-consent-checkbox"),
      ).not.toBeInTheDocument();
    });

    it("emits onConsentChange(true) when the box is ticked", () => {
      const onConsentChange = vi.fn();
      render(
        <FileGridUploader
          files={[makeFile("a.jpg")]}
          onChange={vi.fn()}
          onConsentChange={onConsentChange}
        />,
      );
      // Initial state: unchecked, parent notified false (or no call yet).
      fireEvent.click(screen.getByTestId("photo-consent-checkbox"));
      expect(onConsentChange).toHaveBeenLastCalledWith(true);
    });

    it("links to the Acceptable Use Policy", () => {
      render(
        <FileGridUploader files={[makeFile("a.jpg")]} onChange={vi.fn()} />,
      );
      const link = screen.getByRole("link", { name: /acceptable use policy/i });
      expect(link).toHaveAttribute("href", "/acceptable-use");
    });
  });

  describe("HEIC handling", () => {
    it("shows a placeholder tile instead of <img> for HEIC files", () => {
      const heic = new File(["data"], "IMG_1234.HEIC", {
        type: "image/heic",
      });
      render(<FileGridUploader files={[heic]} onChange={vi.fn()} />);
      // No img with the heic file name
      expect(screen.queryByAltText("IMG_1234.HEIC")).not.toBeInTheDocument();
      // Placeholder tile present
      expect(screen.getByText("HEIC")).toBeInTheDocument();
      expect(screen.getByText(/converted on upload/i)).toBeInTheDocument();
    });

    it("shows the 'HEIC will be converted' hint when a HEIC is selected", () => {
      const heic = new File(["data"], "IMG_1234.HEIC", {
        type: "image/heic",
      });
      render(<FileGridUploader files={[heic]} onChange={vi.fn()} />);
      expect(
        screen.getByText(/HEIC files will be converted to JPEG/i),
      ).toBeInTheDocument();
    });

    it("does NOT show the HEIC hint when all files are standard images", () => {
      render(
        <FileGridUploader files={[makeFile("a.jpg")]} onChange={vi.fn()} />,
      );
      expect(
        screen.queryByText(/HEIC files will be converted to JPEG/i),
      ).not.toBeInTheDocument();
    });
  });
});
