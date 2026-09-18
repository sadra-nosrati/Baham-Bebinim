import './globals.css';

export const metadata = {
<<<<<<< HEAD
  title: 'Baham Bebinim',
  description: 'Baham Bebinim — تماشای همزمان فیلم و چت زنده',
=======
  title: 'باهم ببینیم',
  description: 'تماشای همزمان فیلم و چت زنده',
>>>>>>> 36a02df9b7a639aeb0a5afec20248a6dd6af8ec1
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#08090c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
