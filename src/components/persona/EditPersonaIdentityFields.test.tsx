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
    const onLightningUsernameChange = vi.fn();

    render(
      <EditPersonaIdentityFields
        name="Voice"
        username="voice"
        lightningUsername="donate-voice"
        initialLightningUsername="donate-voice"
        availability={idleAvailability}
        onNameChange={onNameChange}
        onUsernameChange={onUsernameChange}
        onLightningUsernameChange={onLightningUsernameChange}
      />,
    );

    expect(screen.getByText(/Current Lightning Address/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "New Voice" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "new-voice" },
    });
    fireEvent.change(screen.getByLabelText("Lightning address"), {
      target: { value: "new-donate" },
    });

    expect(onNameChange).toHaveBeenCalledWith("New Voice");
    expect(onUsernameChange).toHaveBeenCalledWith("new-voice");
    expect(onLightningUsernameChange).toHaveBeenCalledWith("new-donate");
  });

  it("renders taken username copy without promising suffix fallback", () => {
    render(
      <EditPersonaIdentityFields
        name="Voice"
        username="voice"
        lightningUsername="new-voice"
        initialLightningUsername="voice"
        availability={{ status: "taken", username: "new-voice" }}
        onNameChange={vi.fn()}
        onUsernameChange={vi.fn()}
        onLightningUsernameChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/pick a different Lightning address before saving/i)).toBeInTheDocument();
    expect(screen.queryByText(/random suffix/i)).not.toBeInTheDocument();
  });
});
