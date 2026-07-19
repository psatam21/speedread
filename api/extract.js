import { onRequestGet } from '../functions/api/extract.js';

export const config = { runtime: 'edge' };

export default function handler(request) {
  return onRequestGet({ request });
}
