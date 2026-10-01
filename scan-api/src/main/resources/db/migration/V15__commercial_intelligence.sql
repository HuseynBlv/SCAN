-- Foundation for the CCI-side commercial intelligence workspace: investigations give SCAN
-- institutional memory of a question that was actually asked and worked, field tasks give
-- insight a way to reach real-world execution, and both stay linked so completed field evidence
-- strengthens the investigation it came from.
create table investigation (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    title varchar(256) not null,
    question varchar(512) not null,
    subject_type varchar(32) not null,
    subject_name varchar(256),
    period_days int not null default 14,
    status varchar(32) not null default 'OPEN',
    owner_label varchar(128) not null default 'Commercial Team',
    created_by varchar(128) not null,
    created_at timestamp with time zone not null default current_timestamp,
    updated_at timestamp with time zone not null default current_timestamp,
    closed_at timestamp with time zone
);

create index investigation_retailer_idx on investigation (retailer_id, status);

create table investigation_hypothesis (
    id uuid primary key,
    investigation_id uuid not null references investigation(id) on delete cascade,
    statement varchar(512) not null,
    supporting_evidence varchar(512) not null,
    contradicting_evidence varchar(512),
    confidence varchar(16) not null,
    status varchar(16) not null default 'OPEN',
    sort_order int not null default 0,
    created_at timestamp with time zone not null default current_timestamp,
    updated_at timestamp with time zone not null default current_timestamp
);

create index investigation_hypothesis_investigation_idx on investigation_hypothesis (investigation_id);

create table investigation_note (
    id uuid primary key,
    investigation_id uuid not null references investigation(id) on delete cascade,
    author_username varchar(128) not null,
    body varchar(2000) not null,
    is_system boolean not null default false,
    created_at timestamp with time zone not null default current_timestamp
);

create index investigation_note_investigation_idx on investigation_note (investigation_id);

create table field_task (
    id uuid primary key,
    retailer_id uuid not null references retailer(id),
    investigation_id uuid references investigation(id),
    title varchar(256) not null,
    reason varchar(512) not null,
    assigned_to varchar(128) not null default 'Field Sales Team',
    due_at timestamp with time zone,
    status varchar(32) not null default 'OPEN',
    created_by varchar(128) not null,
    created_at timestamp with time zone not null default current_timestamp,
    updated_at timestamp with time zone not null default current_timestamp
);

create index field_task_retailer_idx on field_task (retailer_id, status);
create index field_task_investigation_idx on field_task (investigation_id);

-- One row per target store; the fixed checklist matches the pilot's field-check scope. A wider,
-- configurable checklist is a real product need but not one this pilot's data can act on yet.
create table field_task_store (
    id uuid primary key,
    field_task_id uuid not null references field_task(id) on delete cascade,
    external_store_id varchar(128) not null,
    stock_available boolean,
    visible_in_cooler boolean,
    correct_placement boolean,
    competitor_present boolean,
    note varchar(1000),
    completed boolean not null default false,
    completed_at timestamp with time zone,
    constraint field_task_store_unique unique (field_task_id, external_store_id)
);

create index field_task_store_task_idx on field_task_store (field_task_id);
