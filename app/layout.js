import './globals.css';

export const metadata = {
  title: 'Baham Bebinim',
  description: 'Baham Bebinim — تماشای همزمان فیلم و چت زنده',
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
