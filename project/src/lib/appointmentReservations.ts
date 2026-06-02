import { supabase } from './supabase';

export async function markReservationVisited(reservationId: string, visitRecordId?: string) {
  const { error } = await supabase
    .from('appointment_reservations')
    .update({
      status: 'visited',
      visit_record_id: visitRecordId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId);
  if (error) throw error;
  window.dispatchEvent(new Event('reservations-updated'));
}
