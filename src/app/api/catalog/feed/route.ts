import { GET as handleFeedGet } from '../feed.csv/route';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(request: Request) {
  return handleFeedGet(request);
}
