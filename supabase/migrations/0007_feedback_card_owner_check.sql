-- Podium v1 — tighten feedback WITH CHECK against cross-user card_id.
--
-- The original feedback owner_rw policy (0002) only checked that
-- `user_id = auth.uid()`. That left a gap: user A could insert feedback
-- correctly attributed to themselves but pointing at user B's card_id, so
-- A's feedback would silently surface against B's card row at v3 multi-user
-- time. Tighten the WITH CHECK to require that any non-null `card_id`
-- belong to the authed user. The USING side stays unchanged — feedback is
-- still readable only by its owner via `user_id = auth.uid()`.
--
-- segment_id is intentionally NOT scoped to auth.uid() — segments are
-- catalog-side, shared across users.
--
-- Replays are tolerated: drop policy if exists is idempotent.

drop policy if exists "owner_rw" on feedback;

create policy "owner_rw" on feedback
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      card_id is null
      or exists (
        select 1 from cards
        where cards.id = feedback.card_id
          and cards.user_id = auth.uid()
      )
    )
  );
