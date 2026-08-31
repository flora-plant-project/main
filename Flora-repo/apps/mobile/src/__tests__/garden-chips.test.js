import { render, screen } from '@testing-library/react-native';
import { WaterChip } from '../components/WaterChip.js';
import '../i18n/index.js';

const DAY = 24 * 60 * 60 * 1000;

describe('WaterChip variants', () => {
  it('overdue nextDueAt renders "Water today"', async () => {
    await render(<WaterChip nextDueAt={new Date(Date.now() - DAY).toISOString()} />);
    expect(screen.getByText('Water today')).toBeTruthy();
  });

  it('nextDueAt today renders "Water today"', async () => {
    await render(<WaterChip nextDueAt={new Date(Date.now()).toISOString()} />);
    expect(screen.getByText('Water today')).toBeTruthy();
  });

  it('future nextDueAt renders "In N days"', async () => {
    await render(<WaterChip nextDueAt={new Date(Date.now() + 3 * DAY).toISOString()} />);
    expect(screen.getByText('In 3 days')).toBeTruthy();
  });

  it('more than a week out renders "All good"', async () => {
    await render(<WaterChip nextDueAt={new Date(Date.now() + 14 * DAY).toISOString()} />);
    expect(screen.getByText('All good')).toBeTruthy();
  });

  it('a plant with no schedule renders "Water today"', async () => {
    await render(<WaterChip nextDueAt={null} />);
    expect(screen.getByText('Water today')).toBeTruthy();
  });
});
