export const palette = {
  bg: '#0E1411', panel: '#1A231D', panel2: '#233028', border: '#35443A',
  text: '#F4F2E9', muted: '#A6B5A8', accent: '#B8F36A', ink: '#172016',
  amber: '#F2B65B', red: '#E56F66', white: '#F3E9D5', green: '#789B69',
};
export const boardThemes = {
  ivory: { label: 'Classic', light: '#EEE4D0', dark: '#829F70', edge: '#594F3F' },
  walnut: { label: 'Walnut', light: '#E5CFA6', dark: '#855F3F', edge: '#503B2C' },
  ocean: { label: 'Ocean', light: '#D7E1DF', dark: '#477785', edge: '#284B59' },
  midnight: { label: 'Midnight', light: '#A5B5AD', dark: '#394C48', edge: '#14201D' },
  tournament: { label: 'Tournament', light: '#E6E8D9', dark: '#72977E', edge: '#304B3E' },
};
export type BoardTheme = keyof typeof boardThemes;
export type PieceFinish = 'ivory' | 'onyx' | 'gold';
