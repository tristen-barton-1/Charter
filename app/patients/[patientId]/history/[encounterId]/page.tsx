import PatientEncounterDetail from "@/components/patient-encounter-detail";

interface PatientEncounterPageProps {
  params: Promise<{
    patientId: string;
    encounterId: string;
  }>;
}

export default async function PatientEncounterPage({ params }: PatientEncounterPageProps) {
  const { patientId, encounterId } = await params;
  return <PatientEncounterDetail patientId={patientId} encounterId={encounterId} />;
}
