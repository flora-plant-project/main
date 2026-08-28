/** Demo users. Every mock account uses the password 'password123'. */
export const seedUsers = [
  {
    id: 'u1',
    username: 'flora_demo',
    password: 'password123',
    displayName: 'Flora Demo',
    climateZone: 'COASTAL',
  },
  {
    id: 'u2',
    username: 'rana_gardens',
    password: 'password123',
    displayName: 'Rana',
    climateZone: 'MOUNTAIN',
  },
  {
    id: 'u3',
    username: 'ziad_bekaa',
    password: 'password123',
    displayName: 'Ziad',
    climateZone: 'BEKAA',
  },
];

/** The demo experience starts logged in as flora_demo. */
export const seedSession = { userId: 'u1', token: 'mock-session-token' };
