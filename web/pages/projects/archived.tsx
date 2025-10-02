export default function ArchivedRedirect() {
  return null;
}
export async function getServerSideProps() {
  return {
    redirect: { destination: "/projects?status=archived", permanent: false },
  };
}
