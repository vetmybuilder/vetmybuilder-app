import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('../../../web/utils/auth', () => ({
  useAuth: () => ({ user: null, loading: false })
}));

import Layout from '../../../web/components/Layout';

describe('<Layout />', () => {
  it('shows "Not signed in" when no user', () => {
    render(<Layout><div>content</div></Layout>);
    expect(screen.getByText(/Not signed in/i)).toBeInTheDocument();
    expect(screen.getByText(/content/i)).toBeInTheDocument();
  });
});
