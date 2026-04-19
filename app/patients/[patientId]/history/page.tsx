import PatientHistory from "@/components/patient-history";

interface PatientHistoryPageProps {
  params: Promise<{
    patientId: string;
  }>;
}

export default async function PatientHistoryPage({ params }: PatientHistoryPageProps) {
  const { patientId } = await params;
  return <PatientHistory patientId={patientId} />;
}
