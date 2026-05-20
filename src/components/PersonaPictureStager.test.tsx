import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, mockFn, mockModule, stubGlobal } from "@/test/api";

import {
  PersonaPictureStager,
  type StagedPersonaPicture,
} from "./PersonaPictureStager";

mockModule("@/hooks/usePpqImage", () => ({
  usePpqImage: () => ({
    mutateAsync: mockFn(),
    isPending: false,
  }),
}));

mockModule("@/hooks/useToast", () => ({
  useToast: () => ({ toast: mockFn() }),
}));

describe("PersonaPictureStager", () => {
  beforeEach(() => {
    stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: mockFn(() => "blob:preview"),
        revokeObjectURL: mockFn(),
      }),
    );
  });

  it("stages a selected image file with a local preview URL", () => {
    const onChange = mockFn<(picture: StagedPersonaPicture | null) => void>();
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
    render(<PersonaPictureStager value={null} onChange={mockFn()} />);

    const prompt = screen.getByLabelText("Image prompt");

    expect(prompt.tagName).toBe("TEXTAREA");
    expect(prompt).toHaveAttribute("rows", "4");
  });
});
