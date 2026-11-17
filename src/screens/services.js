import { icon } from '../ui/icons.js';
export default {
  id:'services',title:'Сервисы',icon:'services',accent:'blue',
  mount(root) {
    root.innerHTML = '<section class="services-layout"><div><span class="eyebrow">ДЕРЖИ ПОД РУКОЙ</span><h1>Все важное.<br><span class="muted">В одном взгляде.</span></h1><p class="muted">Серверы, устройства и фоновые задачи.<br>Здесь будет их состояние.</p><span class="connection-badge"><i></i>Нет подключенных сервисов</span></div><div class="service-placeholder card"><div class="service-illustration" aria-hidden="true"><div>'+icon('services')+'</div><span></span><div>'+icon('link')+'</div></div><h2>Место для твоих<br>подключений</h2><p class="muted">Добавим их, когда выберешь,<br>за чем хочешь наблюдать.</p></div></section>';
    return () => {};
  }
};
