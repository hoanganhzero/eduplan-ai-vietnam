create or replace function eduplan_private.score_interactive_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sections jsonb;
  v_section jsonb;
  v_checkpoint jsonb;
  v_answer jsonb;
  v_points numeric;
  v_total numeric := 0;
  v_earned numeric := 0;
begin
  select sections into v_sections
  from eduplan_private.elearning_lessons
  where id = new.lesson_id;

  for v_section in select value from jsonb_array_elements(coalesce(v_sections, '[]'::jsonb)) loop
    if v_section->>'type' = 'quiz' and nullif(v_section->>'correctAnswer', '') is not null then
      v_points := coalesce(nullif(v_section->>'points', '')::numeric, 1);
      v_total := v_total + v_points;
      if lower(trim(coalesce(new.answers->>(v_section->>'id'), ''))) = lower(trim(v_section->>'correctAnswer')) then
        v_earned := v_earned + v_points;
      end if;
    elsif v_section->>'type' = 'interactive_video' then
      for v_checkpoint in
        select value from jsonb_array_elements(coalesce(v_section#>'{interactiveVideo,checkpoints}', '[]'::jsonb))
      loop
        v_points := greatest(1, least(coalesce(nullif(v_checkpoint->>'points', '')::numeric, 1), 100));
        v_total := v_total + v_points;
        begin
          v_answer := (new.answers->>(v_checkpoint->>'id'))::jsonb;
          v_earned := v_earned + greatest(0, least(coalesce((v_answer->>'earned')::numeric, 0), v_points));
        exception when others then
          null;
        end;
      end loop;
    end if;
  end loop;

  new.score := case when v_total > 0 then round(v_earned * 100 / v_total, 2) else null end;
  return new;
end
$$;

drop trigger if exists score_interactive_progress on eduplan_private.elearning_progress;
create trigger score_interactive_progress
before insert or update of answers, lesson_id
on eduplan_private.elearning_progress
for each row execute function eduplan_private.score_interactive_progress();

revoke all on function eduplan_private.score_interactive_progress() from public;
