import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusBadge from '../../../web/components/StatusBadge';

describe('<StatusBadge />', () => {
  it('renders given value and applies class', () => {
    render(<StatusBadge value="live" />);
    expect(screen.getByText(/live/i)).toBeInTheDocument();
  });

  it('renders unknown for empty', () => {
    render(<StatusBadge value={'' as any} />);
    expect(screen.getByText(/unknown/i)).toBeInTheDocument();
  });
});
