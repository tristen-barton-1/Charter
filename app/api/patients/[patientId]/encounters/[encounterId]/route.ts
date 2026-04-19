import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(_request: Request, context: any) {
  const { patientId, encounterId } = await context.params;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase
    .from("encounters")
    .delete()
    .eq("id", encounterId)
    .eq("patient_id", patientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
