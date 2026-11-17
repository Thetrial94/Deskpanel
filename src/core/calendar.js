const dateFormat=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'Europe/Moscow'});
export function calendarDateLabel(event){
 const start=new Date(event.start);
 if(!event.allDay)return dateFormat.format(start);
 // ICS DTEND for a DATE event is exclusive: 19..21 means 19 and 20.
 const last=new Date(new Date(event.end).getTime()-1);
 return dateFormat.format(start)===dateFormat.format(last)?dateFormat.format(start):dateFormat.formatRange(start,last);
}
