import { GetServerSideProps } from 'next';
import UploadForm from '../../components/UploadForm';
import { getUserAndRole } from '../../lib/auth';
import type { GetServerSidePropsContext } from 'next';

export const getServerSideProps: GetServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const { user, role } = await getUserAndRole(ctx);

  if (!user || role !== 'admin') {
    return {
      redirect: {
        destination: '/login', // of '/' als je geen loginpagina hebt
        permanent: false,
      },
    };
  }

  return { props: {} };
};

export default function UploadPage() {
  return <UploadForm />;
}