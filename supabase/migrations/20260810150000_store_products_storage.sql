-- Public storage bucket for product images. Objects are keyed as
-- "<tenant_id>/<filename>" so a folder-based policy can scope writes to
-- members of that tenant while keeping the bucket publicly readable
-- (product images need to be viewable on the storefront without auth).

insert into storage.buckets (id, name, public)
values ('store-products', 'store-products', true)
on conflict (id) do nothing;

drop policy if exists store_products_storage_public_read on storage.objects;
create policy store_products_storage_public_read
on storage.objects
for select
to public
using (bucket_id = 'store-products');

drop policy if exists store_products_storage_member_write on storage.objects;
create policy store_products_storage_member_write
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'store-products'
  and store.is_store_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists store_products_storage_member_update on storage.objects;
create policy store_products_storage_member_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'store-products'
  and store.is_store_member(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'store-products'
  and store.is_store_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists store_products_storage_member_delete on storage.objects;
create policy store_products_storage_member_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'store-products'
  and store.is_store_member(((storage.foldername(name))[1])::uuid)
);
