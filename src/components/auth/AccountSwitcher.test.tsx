import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  mockFn,
  hoisted,
  mockModule,
} from "@/test/api";

import { AccountSwitcher } from "./AccountSwitcher";

const mocks = hoisted(() => ({
  logout: mockFn(),
  accounts: {
    currentUser: {
      id: "operator",
      pubkey: "operator-pubkey",
      metadata: { name: "Operator", picture: "" },
    },
    otherUsers: [],
  },
}));

mockModule("@/hooks/useLoggedInAccounts", () => ({
  useLoggedInAccounts: () => ({
    ...mocks.accounts,
  }),
}));

mockModule("@/hooks/useLoginActions", () => ({
  useLoginActions: () => ({ logout: mocks.logout }),
}));

describe("AccountSwitcher", () => {
  beforeEach(() => {
    mocks.logout.mockReset();
    Object.assign(globalThis, { Element: window.Element });
  });

  it("consolidates primary navigation links into the profile menu", () => {
    render(
      <MemoryRouter>
        <AccountSwitcher />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button");
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    expect(screen.getByRole("menuitem", { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /my personas/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /new persona/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();
  });

  it("removes add and switch account actions and logs out through the session action", async () => {
    render(
      <MemoryRouter>
        <AccountSwitcher />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button");
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    expect(screen.queryByText(/switch account/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /add another account/i })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));
    });

    expect(mocks.logout).toHaveBeenCalledOnce();
  });
});
