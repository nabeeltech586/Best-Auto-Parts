import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getMatchingPartImage } from '@/lib/partImages';

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    // Fetch all parts for this account
    const { data: parts, error } = await supabase
      .from('parts_catalog')
      .select('id, part_name, sku, category, subcategory, image_url, image_urls')
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = parts || [];
    let updatedCount = 0;
    const nowIso = new Date().toISOString();

    for (const part of items) {
      const hasImage =
        Boolean(part.image_url && part.image_url.trim().length > 0) ||
        (Array.isArray(part.image_urls) && part.image_urls.length > 0 && Boolean(part.image_urls[0]?.trim()));

      if (!hasImage || force) {
        const matchedImage = getMatchingPartImage(part);

        // Try updating image_url and image_urls
        let updateRes = await supabase
          .from('parts_catalog')
          .update({
            image_url: matchedImage,
            image_urls: [matchedImage],
            updated_at: nowIso,
          })
          .eq('id', part.id)
          .eq('account_id', accountId);

        // Fallback retry without image_url if column not yet migrated
        if (updateRes.error) {
          updateRes = await supabase
            .from('parts_catalog')
            .update({
              image_urls: [matchedImage],
              updated_at: nowIso,
            })
            .eq('id', part.id)
            .eq('account_id', accountId);
        }

        if (!updateRes.error) {
          updatedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synchronized product thumbnail photos for ${updatedCount} parts.`,
      updated_count: updatedCount,
      total_parts: items.length,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
