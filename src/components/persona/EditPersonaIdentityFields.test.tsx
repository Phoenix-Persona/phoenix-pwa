import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditPersonaIdentityFields } from "./EditPersonaIdentityFields";
import type { UsernameAvailabilityState } from "@/hooks/useUsernameAvailability";

const idleAvailability: UsernameAvailabilityState = {
  status: "idle",
};

describe("EditPersonaIdentityFields", () => {
  it("renders current username status and propagates field edits", () => {
    const onNameChange = vi.fn();
    const onUsernameChange = vi.fn();

    render(
      <EditPersonaIdentityFields
        name="Voice"
        username="voice"
        initialUsername="voice"
        availability={idleAvailability}
        onNameChange={onNameChange}
        onUsernameChange={onUsernameChange}
      />,
    );

    expect(screen.getByText(/Current Lightning Address/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "New Voice" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "new-voice" },
    });

    expect(onNameChange).toHaveBeenCalledWith("New Voice");
    expect(onUsernameChange).toHaveBeenCalledWith("new-voice");
  });

  it("renders taken username copy without promising suffix fallback", () => {
    render(
      <EditPersonaIdentityFields
        name="Voice"
        username="new-voice"
        initialUsername="voice"
        availability={{ status: "taken", username: "new-voice" }}
        onNameChange={vi.fn()}
        onUsernameChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/pick a different name before saving/i)).toBeInTheDocument();
    expect(screen.queryByText(/random suffix/i)).not.toBeInTheDocument();
  });
});
