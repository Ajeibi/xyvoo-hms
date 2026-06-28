-- Add spa and transportation guest service categories (extend check constraint).

alter table hotel.guest_requests drop constraint if exists guest_requests_service_category_check;

alter table hotel.guest_requests
  add constraint guest_requests_service_category_check
  check (service_category in (
    'housekeeping', 'laundry', 'food_beverage', 'concierge',
    'maintenance', 'security', 'special', 'other',
    'spa', 'transportation'
  ));
