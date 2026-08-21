create index if not exists workspace_state_updated_by_idx
  on eduplan_private.workspace_state(updated_by)
  where updated_by is not null;
