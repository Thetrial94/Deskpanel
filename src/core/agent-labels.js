export const agentStatus={working:'Работает',waiting:'Ждёт ответа',approval:'Ждёт разрешения',completed:'Ответ завершён',interrupted:'Прервано',idle:'Ожидает задачу',stale:'Нет свежих событий',error:'Ошибка'};
export const agentConnection={not_configured:'Не подключён',awaiting_events:'Ждём первое событие',pair_required:'Подключи телефон',disconnected:'Нет связи',connected:'Подключён'};

export const sessionStatus = session => session.source==='local_metadata'&&session.status==='working'?'В процессе':agentStatus[session.status]||'Статус неизвестен';
