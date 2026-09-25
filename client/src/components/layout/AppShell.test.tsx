import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import AppShell from './AppShell';
import { renderWithProviders, candidateUser } from '../../test/test-utils';

describe('AppShell', () => {
  it('renders the sidebar, topbar and nested route content together', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>Nested Page Content</div>} />
        </Route>
      </Routes>,
      { loggedInAs: candidateUser }
    );

    expect(screen.getByText('WissenCode')).toBeInTheDocument();
    expect(screen.getByText(candidateUser.name)).toBeInTheDocument();
    expect(screen.getByText('Nested Page Content')).toBeInTheDocument();
  });
});
