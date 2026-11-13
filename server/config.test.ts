import { expect, it } from 'vitest';
import { readConfig } from './config';

it('derives runtime paths from any host URL without requiring a frontend rebuild', () => {
  expect(readConfig({}).basePath).toBe('');
  expect(readConfig({ PUBLIC_URL: 'https://typing.example.com/games/fall/' })).toMatchObject({
    basePath: '/games/fall', publicOrigin: 'https://typing.example.com',
  });
  expect(readConfig({ BASE_PATH: '/typing/' }).basePath).toBe('/typing');
  expect(readConfig({ PUBLIC_URL: 'https://other.example.net' }).basePath).toBe('');
});

it.each([
  { PUBLIC_URL: 'ftp://example.com' },
  { PUBLIC_URL: 'https://example.com/?token=secret' },
  { PUBLIC_URL: 'https://example.com/game', BASE_PATH: '/other' },
  { BASE_PATH: '//other.example.com' },
  { BASE_PATH: '/game/../private' },
  { PORT: 'not-a-port' },
])('rejects invalid deployment configuration: %j', (env) => {
  expect(() => readConfig(env)).toThrow();
});
