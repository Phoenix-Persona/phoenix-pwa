import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "@/test/api";

import { PersonaHero } from "./PersonaHero";

describe("PersonaHero", () => {
  it("renders image, bio, badges, and actions slots", () => {
    render(
      <PersonaHero
        eyebrow="Public persona"
        name="Voice"
        bio="Bio"
        pictureUrl="https://example.com/pic.png"
        avatarSize="public"
        badges={<span>npub1abc</span>}
        actions={<button type="button">Edit</button>}
      />,
    );

    expect(screen.getByText("Public persona")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Voice" })).toBeInTheDocument();
    expect(screen.getByText("Bio")).toBeInTheDocument();
    expect(screen.getByAltText("")).toHaveAttribute("src", "https://example.com/pic.png");
    expect(screen.getByText("npub1abc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("renders fallback seal when no picture is available", () => {
    render(
      <PersonaHero
        eyebrow="Composer"
        name="Voice"
        pictureUrl={null}
        avatarSize="dashboard"
      />,
    );

    expect(screen.getByRole("heading", { name: "Voice" })).toBeInTheDocument();
    expect(screen.queryByAltText("")).not.toBeInTheDocument();
  });
});
