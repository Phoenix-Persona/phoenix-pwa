import { render, screen } from '@testing-library/react';
import { expect, test } from '@/test/api';

import App from './App';

test('App', async () => {
  render(<App />);
  expect(await screen.findAllByText('Sign in to begin')).not.toHaveLength(0);
})
