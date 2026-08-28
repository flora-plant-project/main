import { render, screen } from '@testing-library/react-native';
import { WaterChip } from '../components/WaterChip.js';
import '../i18n/index.js';

const DAY = 24 * 60 * 60 * 1000;

describe('WaterChip variants', () => {
  it('overdue nextDueAt renders "Water now"', async () => {
    await render(<WaterChip nextDueAt={new Date(Date.now() - DAY).toISOString()} />);
    expect(screen.getByText('Water now')).toBeTruthy();
  });

  it('nextDueAt today renders "Today"', async () => {
    await render(<WaterChip nextDueAt={new Date(Date.now()).toISOString()} />);
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('future nextDueAt renders "in Nd"', async () => {
    await render(<WaterChip nextDueAt={new Date(Date.now() + 3 * DAY).toISOString()} />);
    expect(screen.getByText('in 3d')).toBeTruthy();
  });

  it('a plant with no schedule renders "Water now"', async () => {
    await render(<WaterChip nextDueAt={null} />);
    expect(screen.getByText('Water now')).toBeTruthy();
  });
});
