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

export async function markMatchingReservationVisited(customerId: string, visitDate: string, visitRecordId?: string) {
  const { data, error } = await supabase
    .from('appointment_reservations')
    .select('id')
    .eq('customer_id', customerId)
    .eq('reservation_date', visitDate)
    .eq('entry_kind', 'appointment')
    .neq('status', 'visited')
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true })
    .limit(1);

  if (error) throw error;
  const reservationId = data?.[0]?.id;
  if (!reservationId) return false;

  await markReservationVisited(reservationId, visitRecordId);
  return true;
}
