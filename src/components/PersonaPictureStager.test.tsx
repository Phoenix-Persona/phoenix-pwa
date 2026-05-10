import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PersonaPictureStager,
  type StagedPersonaPicture,
} from "./PersonaPictureStager";

vi.mock("@/hooks/usePpqImage", () => ({
  usePpqImage: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("PersonaPictureStager", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:preview"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  it("stages a selected image file with a local preview URL", () => {
    const onChange = vi.fn<(picture: StagedPersonaPicture | null) => void>();
    const file = new File(["image"], "portrait.png", { type: "image/png" });
    const { container } = render(
      <PersonaPictureStager value={null} onChange={onChange} />,
    );

    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInstanceOf(HTMLInputElement);

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [file] },
    });

    expect(onChange).toHaveBeenCalledWith({
      file,
      previewUrl: "blob:preview",
      source: "upload",
    });
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
  });

  it("uses a multiline prompt field for generated portraits", () => {
    render(<PersonaPictureStager value={null} onChange={vi.fn()} />);

    const prompt = screen.getByLabelText("Image prompt");

    expect(prompt.tagName).toBe("TEXTAREA");
    expect(prompt).toHaveAttribute("rows", "4");
  });
});
