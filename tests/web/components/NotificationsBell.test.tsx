import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ children }: any) => <a>{children}</a>
}));
vi.mock('../../../web/utils/api', () => ({
  useApi: () => ({
    get: vi.fn().mockResolvedValue({ items: [] }),
    sse: vi.fn().mockReturnValue({ close: vi.fn() })
  })
}));

import NotificationsBell from '../../../web/components/NotificationsBell';

describe('<NotificationsBell />', () => {
  it('renders without crashing', () => {
    const { container } = render(<NotificationsBell />);
    expect(container).toBeTruthy();
  });
});
