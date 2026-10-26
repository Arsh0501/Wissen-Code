import { describe, it, expect, vi } from "vitest";
import api from "../services/api";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";
import LoginPage from "./LoginPage";
import {
  renderWithProviders,
  adminUser,
  candidateUser,
} from "../test/test-utils";

function renderLoginPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<div>Dashboard Home</div>} />
    </Routes>,
    { initialEntries: ["/login"] },
  );
}

describe("LoginPage", () => {
  it("renders the sign-in form", () => {
    renderLoginPage();
    expect(
      screen.getByRole("heading", { name: /welcome back/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  it("logs in and redirects on valid credentials", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), adminUser.email);
    await user.type(screen.getByLabelText(/password/i), adminUser.password);
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText("Dashboard Home")).toBeInTheDocument(),
    );
  });

  it("shows an error message on invalid credentials", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), adminUser.email);
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid email or password/i,
    );
  });
});

describe("LoginPage portals", () => {
  it("sends the audience and shows a switch card when the account belongs to the other portal", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockImplementationOnce(async (_url, body: any) => {
      expect(body.audience).toBe("hiring");
      throw {
        response: {
          status: 403,
          data: {
            error: "Wrong portal",
            code: "WRONG_PORTAL",
            portal: "candidate",
          },
        },
      };
    });
    renderLoginPage();
    await user.type(screen.getByLabelText(/email/i), candidateUser.email);
    await user.type(screen.getByLabelText(/password/i), candidateUser.password);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /candidate account/i,
    );
    expect(
      screen.getByRole("link", { name: /go to candidate sign-in/i }),
    ).toHaveAttribute("href", expect.stringContaining("/candidate/login"));
  });

  it("offers sign-up only on the candidate door", () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/candidate/login"
          element={<LoginPage audience="candidate" />}
        />
      </Routes>,
      { initialEntries: ["/candidate/login"] },
    );
    expect(screen.getByRole("tab", { name: /sign up/i })).toBeInTheDocument();
    expect(screen.queryByText(/invite-only/i)).not.toBeInTheDocument();
  });
});
