import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { JogadorApp } from '@/jogador/JogadorApp';
import { AvisoDeVersao } from '@/ui/AvisoDeVersao';
import { FalhaGeral } from '@/ui/FalhaGeral';

// Seção 13: o admin é carregado com lazy(); o jogador não baixa esse código.
const AdminApp = lazy(() => import('@/admin/AdminApp'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FalhaGeral>
      <BrowserRouter>
      <Routes>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<div className="p-8 text-tinta-suave">Carregando o painel…</div>}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="*" element={<JogadorApp />} />
      </Routes>
      </BrowserRouter>
    </FalhaGeral>
    <AvisoDeVersao />
  </StrictMode>,
);
