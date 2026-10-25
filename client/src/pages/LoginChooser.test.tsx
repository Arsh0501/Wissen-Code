import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import LoginChooser from "./LoginChooser";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ isLoggedIn: false }),
}));
vi.mock("../context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}));

describe("LoginChooser", () => {
  it("offers a candidate door and an admin door", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginChooser />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /login for candidate/i }),
    ).toHaveAttribute("href", "/candidate/login");
    expect(
      screen.getByRole("link", { name: /login for admin/i }),
    ).toHaveAttribute("href", "/admin/login");
  });
});
