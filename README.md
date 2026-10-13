# Pollicino

Registra un percorso con il GPS del dispositivo (o importa un file GPX) e mostra tempo, posizione e velocità in una tabella, sulla mappa e nei grafici spazio-tempo e velocità-tempo.

- **Intervallo**: si sceglie per tempo o per spazio dalla barra dei comandi, oppure toccando la mappa (o un grafico, o una riga della tabella) per fissare un punto e usarlo come inizio o fine.
- **Registrazione**: un punto ogni N secondi (a scelta), più il pulsante `+ Punto` per aggiungerne uno a mano con l'istante e la posizione attuali. I punti si possono eliminare uno a uno.
- **Modalità manuale**: i punti si inseriscono toccando la mappa e il tempo è quello trascorso dal primo punto.
- **Riproduzione**: il pulsante play sulla mappa rivede il percorso, mezzo secondo per punto.
- **Fit**: su ogni grafico si può adattare una funzione lineare, quadratica o polinomiale (grado 3–6) ai punti mostrati, con equazione e R².
- **Filtro precisione**: opzionale, nasconde i punti con precisione GPS peggiore della soglia senza eliminarli.
- **Tachimetro**: velocità dal vivo durante la registrazione, sempre in vista.
- **Esportazione**: dati in CSV, grafici in PNG.
- La traccia resta salvata nel browser finché non viene cancellata.

## Sviluppo

```
npm install
npm run dev
```

La geolocalizzazione funziona solo su `https://` o su `localhost`: per provarla da smartphone serve il sito pubblicato (il workflow in `.github/workflows` lo pubblica su GitHub Pages).
