# Backend Architecture

This app uses Supabase as the durable data store and Next.js route handlers as the backend layer.

## Environment

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_WORKSPACE_ID` optional, defaults to `default`

## Data Flow

1. The dashboard loads patients from `GET /api/patients`.
2. The patient cards show organization/display only.
3. `Start Encounter` opens the client-side note workspace.
4. Ending an encounter writes a single encounter row to Supabase.
5. `View Saved Notes` loads dated encounters for the selected patient from Supabase.
6. Adding a patient calls `POST /api/patients`.

## API Routes

- `GET /api/patients`
- `POST /api/patients`
- `GET /api/patients/[patientId]/encounters`
- `POST /api/patients/[patientId]/encounters`

## Tables

- `patients`
- `encounters`

Each encounter stores the transcript, the parsed trigger output, the generated notes, and the editable note text that was saved.
