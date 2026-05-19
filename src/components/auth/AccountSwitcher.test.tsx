import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
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
  setLogin: mockFn(),
  removeLogin: mockFn(),
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
    setLogin: mocks.setLogin,
    removeLogin: mocks.removeLogin,
  }),
}));

describe("AccountSwitcher", () => {
  beforeEach(() => {
    mocks.setLogin.mockReset();
    mocks.removeLogin.mockReset();
    Object.assign(globalThis, { Element: window.Element });
  });

  it("consolidates primary navigation links into the profile menu", () => {
    render(
      <MemoryRouter>
        <AccountSwitcher onAddAccountClick={mockFn()} />
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
});
