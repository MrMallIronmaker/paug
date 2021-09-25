// --------------------------------------------------------------------
// Airtable concerns:

var calendar;

var entryCategories;

$.ajax({dataType: "json", url: "/category/", async: false, success: function(data, textStatus, jqXHR) {
    entryCategories = data.map(function(cat) {return({"id": cat.pk, "name": cat.fields.name, "color": cat.fields.html_color})});
}});

function getCategory(id) {
    return entryCategories.filter(x => x.id === id)[0];
}

var entryTypes = ["Event", "Task", "Record"];

var sumDurations = function(arr) {
    return arr.reduce(
        function(acc, ev) {
            return acc + moment(ev.end).diff(moment(ev.start), "hours", true);
        },
        0.0
    );
};

var showHideCallback = function(id) {
    return function() {
        var x = document.getElementById(id);
        if (x.style.display === 'none') {
            x.style.display = 'block';
            this.innerText = 'Hide';
        } else {
            x.style.display = 'none';
            this.innerText = 'Show';
        }
    };
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            // Does this cookie string begin with the name we want?
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

const csrftoken = getCookie('csrftoken');

document.addEventListener('DOMContentLoaded', function () {
    var Calendar = FullCalendar.Calendar;
    var Draggable = FullCalendar.Draggable;

    var containerEl = document.getElementById('external-events');
    var calendarEl = document.getElementById('calendar');
    var checkbox = document.getElementById('drop-remove');

    // initialize the external events
    // -----------------------------------------------------------------

    // load stuff from the base.
    var draggableCategory = $("#draggable-category");
    draggableCategory[0].add(new Option("All"));
    entryCategories.forEach(function(category) {
        draggableCategory[0].add(new Option(category.name));
    });

    draggableCategory.change(function() {
        // get all potential entries
        var categoryText = draggableCategory[0].options[draggableCategory[0].selectedIndex].text;
        $(containerEl).children(".fc-event").each(function() {
            if ($(this).data("category") !== categoryText && categoryText !== "All") {
                $(this).hide();
            } else {
                $(this).show();
            }
        });
    })

    $.getJSON(
        "/block/",
        {to: "schedule"},
        function(data, textStatus, jqXHR) {
            data.forEach(function (record) {
                var srcHtml = "<div class='fc-event fc-h-event fc-daygrid-event fc-daygrid-block-event'>\n" +
                    "        <div class='fc-event-main'>" + record.fields.name + "</div>\n" +
                    "    </div>"
                var entry = $(srcHtml);
                entry.css(
                    "background-color",
                    computeColor({extendedProps: {category: getCategory(record.fields.category)}})
                );
                entry.data({
                    duration: record.fields.duration,
                    id: record.pk,
                    category: getCategory(record.fields.category),
                    entryType: record.fields.autocomplete ? "Event" : "Task",
                });
                $("#external-events").append(entry);
            });
        }
    );


    $("#inbox-toggle").click(showHideCallback('inbox-iframe'));
    $("#schedule-toggle").click(showHideCallback('external-events'));

    new Draggable(containerEl, {
        itemSelector: '.fc-event',
        eventData: function (eventEl) {
            return {
                title: eventEl.innerText,
                duration: {minutes: $(eventEl).data("duration")},
                id: $(eventEl).data("id"),
                extendedProps: {
                    category: $(eventEl).data("category"),
                    entryType: $(eventEl).data("entryType")
                }
            };
        }
    });

    // color computation
    var computeColor = function(eventSpec) {
        if (eventSpec.extendedProps.category) {
            return eventSpec.extendedProps.category.color;
        }
        else {
            return "#777777";
        }
    }

    // initialize the context menu
    // -------------------------------

    var eventFromOpt = function(opt) {
        var prefix = "pg-event-id-";
        var id = Array.from(opt.$trigger[0].classList).filter(n => n.startsWith(prefix))[0].substring(prefix.length);
        return calendar.getEventById(id);
    }

    var menuActivationOffsetPos;

    $.contextMenu({
        // define which elements trigger this menu
        selector: ".eventmenu",
        // define the elements of the menu
        items: {
            complete: {
                name: "Complete",
                callback: function (key, opt) {
                    var event = eventFromOpt(opt);
                    event.setExtendedProp("completed", !event.extendedProps.completed);
                }
            },
            rename: {
                name: "Rename",
                callback: function (key, opt, rootMenu, originalEvent) {
                    var event = eventFromOpt(opt);
                    var new_name = prompt("Enter a new event title", event.title);
                    if (new_name) {
                        event.setProp("title", new_name);
                    }
                }
            },
            category: {
                name: "Category",
                items: entryCategories.reduce((a, cat) => Object.assign(a, {
                    [cat.name]: {
                        name: cat.name,
                        callback: function (key, opt, rootMenu, originalEvent) {
                            var event = eventFromOpt(opt);
                            event.setExtendedProp("category", cat);
                            event.setProp("color", computeColor(event));
                        }
                    }
                }), {})
            },
            entryType: {
                name: "Type",
                items: entryTypes.reduce((a, cat) => Object.assign(a, {
                    [cat]: {
                        name: cat,
                        callback: function (key, opt, rootMenu, originalEvent) {
                            var event = eventFromOpt(opt);
                            event.setExtendedProp("entryType", key);
                        }
                    }
                }), {})
            },
            split: {
                name: "Split",
                callback: function(key, opt, rootMenu, originalEvent) {
                    var event = eventFromOpt(opt);
                    var jelement = opt.$trigger;

                    // map to proportion of height of element,
                    var heightProportion = (menuActivationOffsetPos.y - jelement.offset().top) / jelement.height();

                    // TODO: I think this will break if resolution is larger than 1 hour.
                    var slotDurationMs = calendar.currentData.options.slotDuration.milliseconds;
                    var eventDurationMs = moment(event.end).diff(moment(event.start), "milliseconds");
                    var slots = eventDurationMs / slotDurationMs;

                    // if it's too small, you can't split it at this resolution.
                    if (slots <= 1) {
                        return;
                    }

                    // Otherwise, figure out how many slots you should make the earlier child have.
                    var earlyChildSlotCount = Math.min(
                        Math.max(
                            Math.round(heightProportion * eventDurationMs / slotDurationMs),
                            1),
                        Math.floor(slots - 0.01)
                    );

                    // calculate the timings for the new event.
                    var lateChildEnd = event.end;
                    var childSplitPoint = moment(event.start).add(earlyChildSlotCount * slotDurationMs, 'milliseconds').format();

                    var newExtendedProps = {};
                    Object.assign(newExtendedProps, event.extendedProps);

                    // shorten old event
                    event.setEnd(childSplitPoint);

                    // create new event.
                    var lateChildEvent = calendar.addEvent({
                        title: event.title,
                        start: childSplitPoint,
                        end: lateChildEnd,
                        extendedProps: newExtendedProps
                    });

                    lateChildEvent.setProp("color", computeColor(lateChildEvent));
                }
            },
            postpone: {
                name: "Postpone",
                callback: function(key, opt) {
                    var event = eventFromOpt(opt);
                    event.moveDates({day: 1});
                }
            },
            unschedule: {
                name: "Unschedule",
                callback: function(key, opt) {
                    var event = eventFromOpt(opt);
                    event.unschedule = true;
                    event.remove();
                }},
            delete: {
                name: "Delete",
                callback: function (key, opt, rootMenu, originalEvent) {
                    eventFromOpt(opt).remove();
                }
            }
        },
        position: function(opt, x, y){
            menuActivationOffsetPos = {x: x, y: y};
            // TODO: when the menu is too far right or down, create it above or left of the click.
            return opt.$menu.css({top: y, left: x});
        }

        // there's more, have a look at the demos and docs...
    });

    // initialize the calendar
    // -----------------------------------------------------------------

    var updateAirtable = function (info) {
        var event = info.event;

        var xhr = new XMLHttpRequest();
        xhr.open("PUT", "/block/", true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-CSRFToken', csrftoken);
        xhr.onload = function (e) {
          if (xhr.readyState === 4) {
            if (xhr.status === 200) {
              console.log(xhr.responseText);
            } else {
              console.error(xhr.statusText);
            }
          }
        };
        xhr.onerror = function (e) {
          console.error(xhr.statusText);
        };

        var event_spec = {
            "pk": event.id,
            "fields": {
                "name": event.title,
                "category": event.extendedProps.category.id,
                "completed": event.extendedProps.completed,
                "entry_type": event.extendedProps.entryType
            }
        };
        if (event.start !== null) {
            event_spec.fields["start"] = moment(event.start).format("YYYY-MM-DD H:mm:ss ZZ");
            event_spec.fields["end"] = moment(event.end).format("YYYY-MM-DD H:mm:ss ZZ");
        } else {
            event_spec.fields["start"] = null;
            event_spec.fields["end"] = null;
        }

        xhr.send(JSON.stringify(event_spec));

    };

    calendar = new Calendar(calendarEl, {
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridDay,timeGridFourDay,timeGridWeek,timeGridTenDay,dayGridFiveWeek'
        },
        expandRows: true,
        eventColor: "#777777",
        initialView: 'timeGridWeek',
        views: {
            timeGridDay: {
                slotDuration: '00:15:00',
                scrollTime: '06:00:00'
            },
            timeGridWeek: {
                slotDuration: '00:30:00'
            },
            timeGridTenDay: {
                type: 'timeGrid',
                visibleRange: function (currentDate) {
                    // Generate a new date for manipulating in the next step
                    var startDate = new Date(currentDate.valueOf());
                    var endDate = new Date(currentDate.valueOf());

                    // Adjust the start & end dates, respectively
                    startDate.setDate(startDate.getDate() - 1);
                    endDate.setDate(endDate.getDate() + 8);

                    return {start: startDate, end: endDate};
                },
                buttonText: '10 day'
            },
            timeGridFourDay: {
                type: 'timeGrid',
                visibleRange: function (currentDate) {
                    // Generate a new date for manipulating in the next step
                    var startDate = new Date(currentDate.valueOf());
                    var endDate = new Date(currentDate.valueOf());

                    // Adjust the start & end dates, respectively
                    startDate.setDate(startDate.getDate() - 1);
                    endDate.setDate(endDate.getDate() + 2);

                    return {start: startDate, end: endDate};
                },
                buttonText: '4 day',
                slotDuration: '00:15:00'
            },
            dayGridFiveWeek: {
                type: 'dayGrid',
                // TODO: it would be really nice to see some stuff in the previous week too,
                // but I don't think that's possible.
                duration: {weeks: 5},
                buttonText: '5 week'
            }
        },
        datesSet: function (dateInfo) {
            switch (dateInfo.view.type) {
                case 'timeGridDay':
                    calendar.setOption('height', 3000);
                    break;
                case 'timeGridWeek':
                    calendar.setOption('height', 800);
                    break;
                case 'dayGridFiveWeek':
                    calendar.setOption('height', 1200);
                    break;
                default:
                // code block
            }
        },
        editable: true,
        droppable: true, // this allows things to be dropped onto the calendar
        selectable: true,
        drop: function (info) {
            // TODO: is there where I need to do the magic to carry over
            // the color and such?
            info.draggedEl.parentNode.removeChild(info.draggedEl);
        },
        nowIndicator: true,
        eventSources:
            [
                function (info, successCallback, failureCallback) {
                    // TODO: handle failure

                    $.getJSON("/block/", {
                        start: moment(info.start).format("YYYY-MM-DD HH:mm:ss ZZ"),
                        end: moment(info.end).format("YYYY-MM-DD HH:mm:ss ZZ")
                    }, function(data, textStatus, jqXHR) {
                        successCallback(
                            data.map(function(record) {
                                var spec = {
                                    title: record.fields.name,
                                    start: record.fields.start,
                                    end: record.fields.end,
                                    id: record.pk,
                                    extendedProps: {
                                        category: getCategory(record.fields.category),
                                        entryType: record.fields.autocomplete ? "Event" : "Task",
                                        completed: record.fields.completed,
                                        piece: "block"
                                    }
                                }
                                spec["color"] = computeColor(spec);
                                return spec;
                            })
                        );
                    });
                }
                /*,
                function (info, successCallback, failureCallback) {
                    var allSpans = [];

                    base('Span').select({
                        view: "Full View"
                    }).eachPage(function page(records, fetchNextPage) {
                        allSpans = allSpans.concat(records);
                        fetchNextPage();
                    }, function done(err) {
                        if (err) {
                            failureCallback(err);
                            console.error(err);
                        }
                        // now we have records.
                        successCallback(
                            allSpans.map(function (record) {
                                var spec = {
                                    title: record.get("Name"),
                                    start: record.get("Start"),
                                    end: record.get("End"),
                                    id: record.getId(),
                                    extendedProps: {
                                        category: record.get("Category"),
                                        load: record.get("Load (Hours)"),
                                        pulled: record.get("Pulled (Hours)"),
                                        piece: "span"
                                    }
                                };
                                spec["color"] = computeColor(spec);
                                return spec;
                            })
                        );
                    });
                }*/
            ],
        eventReceive: function (receiveInfo) {
            updateAirtable(receiveInfo);
            receiveInfo.event.setProp("color", computeColor(receiveInfo.event));
        },
        eventAdd: function(addInfo) {
            var event = addInfo.event;
            if (event.extendedProps.entryType === undefined) {
                event.extendedProps.entryType = "Task";
            }
            var xhr = new XMLHttpRequest();
            xhr.open("POST", "/block/", true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('X-CSRFToken', csrftoken);

            xhr.onload = function (e) {
              if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                  event.setProp("id", JSON.parse(xhr.responseText)[0]['pk'])
                } else {
                  console.error(xhr.statusText);
                }
              }
            };
            xhr.onerror = function (e) {
              console.error(xhr.statusText);
            };
            xhr.send(JSON.stringify({
                "name": event.title,
                "start": moment(event.start).format("YYYY-MM-DD H:mm:ss ZZ"),
                "end": moment(event.end).format("YYYY-MM-DD H:mm:ss ZZ"),
                "entry_type": event.extendedProps.entryType
            }));
        },
        eventChange: function (changeInfo) {
            // this can change start and end, and potentially duration.
            // this is also called after properties is changed, i.e, after Airtable gets back with the record.
            updateAirtable(changeInfo);
        },
        eventRemove: function(removeInfo) {
            var event = removeInfo.event;
            if (removeInfo.event.unschedule) {

                var xhr = new XMLHttpRequest();
                xhr.open("PUT", "/block/", true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('X-CSRFToken', csrftoken);
                xhr.onload = function (e) {
                  if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                      console.log(xhr.responseText);
                    } else {
                      console.error(xhr.statusText);
                    }
                  }
                };
                xhr.onerror = function (e) {
                  console.error(xhr.statusText);
                };

                var event_spec = {
                    "pk": event.id,
                    "fields": {
                        "name": event.title,
                        "category": event.extendedProps.category.id,
                        "completed": event.extendedProps.completed,
                        "entry_type": event.extendedProps.entryType,
                        // TODO: auto-calculate duration when unscheduled.
                        "start": null,
                        "end": null
                    }
                };

                xhr.send(JSON.stringify(event_spec));
            } else {
                var xhr = new XMLHttpRequest();
                xhr.open("DELETE", "/block/", true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('X-CSRFToken', csrftoken);

                xhr.onload = function (e) {
                  if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                      console.log("deleted successfully...");
                    } else {
                      console.error(xhr.statusText);
                    }
                  }
                };
                xhr.onerror = function (e) {
                  console.error(xhr.statusText);
                };
                xhr.send(JSON.stringify({
                    "pk": event.id,
                }));
            }
        },
        select: function (selectionInfo) {
            var abc = prompt('Enter Title');
            var newEvent = {
                title: abc,
                start: selectionInfo.start,
                end: selectionInfo.end,
                extendedProps: {
                    entryType: "Task"
                }
            };
            if (abc) {
                calendar.addEvent(newEvent);
            }
        },
        eventClassNames: function(arg) {
            var classNames = ['eventmenu', 'pg-event-id-' + arg.event.id];

            if (arg.event.extendedProps.piece === "span") {
                return (classNames);
            }

            // Also, let's figure out whether we've got a special view.
            if (arg.view.type === "dayGridFiveWeek") {
                classNames.push("pg-day-grid-ignore");
            }

            if (arg.event.extendedProps.entryType === "Task") {
                if (arg.event.extendedProps.completed) {
                    // Completed tasks are pretty easy: if they're in the past, we're golden,
                    // otherwise they should be diagonally marked as 'weird'
                    if (arg.event.end < moment().add(10, "minutes")) {
                        classNames.push("pg-task-complete-past");
                    } else {
                        classNames.push("pg-task-complete-future");
                    }
                } else {
                    // If the task is incomplete, we have to ask two questions about it.
                    // First, what is the relationship with the deadline?
                    if (arg.event.extendedProps.due === undefined) {
                        classNames.push("pg-task-ontime");
                    }
                    else if (arg.event.extendedProps.due < moment.now()) {
                        // Is it overdue?
                        classNames.push("pg-task-overdue");
                    } else if (arg.event.extendedProps.due < arg.event.end) {
                        // Is it going to be overdue by the time we do it?
                        classNames.push("pg-task-badschedule");
                    } else {
                        classNames.push("pg-task-ontime");
                    }

                    // Second, what is the relationship between the scheduled and current time?
                    if (arg.event.end < moment().subtract(10, "minutes")) {
                        classNames.push("pg-task-incomplete-past");
                    }
                }
            } else {
                // this is the case for events and for records (at the moment)
                // Events are incomplete before they finish, and complete after they finish.
                if (arg.event.end < moment.now()) {
                    classNames.push("pg-event-past");
                } else {
                    classNames.push("pg-event-future");
                }
            }

            return classNames;
        },
        eventsSet: function(events) {
            // when calculating, this doens't handle midnight right.
            $("th.fc-day").each(function(i, el) {

                // the logic here is to calculate the number of work events and tasks.
                // then display the result such that
                var elementDate = moment($(el).attr("data-date")).startOf('day');
                var currentDate = moment().startOf('day');
                var elementDateEnd = moment(elementDate).add(1, 'day');
                var maxWorkHours = 7;
                var workEntries = events.filter(ev => (
                        moment(ev.start) >= elementDate &&
                            moment(ev.end) <= elementDateEnd &&
                            ev.extendedProps.category &&
                            ev.extendedProps.category.name === "Work"
                ));

                var workEventHours = sumDurations(
                    workEntries.filter(ev => (ev.extendedProps.entryType === "Event"))
                );

                var workTaskHours = sumDurations(
                    workEntries.filter(ev => (ev.extendedProps.entryType !== "Event"))
                );

                var dateDiff = elementDate.diff(currentDate, 'days');
                var dateFactor = 1;
                if (dateDiff === 1) {
                    dateFactor = .75;
                } else if (dateDiff > 1) {
                    dateFactor = .5;
                }

                // actual open time is not this,
                // TODO: when events are overshceduled, don't make free time less negative
                var openSchedulingTime = (maxWorkHours - workEventHours) * dateFactor - workTaskHours;
                var openTime = maxWorkHours - workTaskHours - workEventHours;

                var dateStatus = "pg-day-open";
                if (workEventHours + workTaskHours > maxWorkHours) {
                    dateStatus = "pg-day-overfull";
                } else if (openSchedulingTime < 0) {
                    dateStatus = "pg-day-overfullearly";
                } else if (openSchedulingTime === 0) {
                    dateStatus = "pg-day-full";
                }

                // correct the value (or add it)
                var hl = $(el).find("p.hours-left");
                if (hl.length > 0) {
                    hl[0].innerHTML = openSchedulingTime.toString();
                } else {
                    $(el).append('<p class="hours-left">' + openSchedulingTime.toString() + "</p>");
                }

                // add in the css class indicating the status of the date
                $(el).removeClass("pg-day-open pg-day-overfull pg-day-overfullearly pg-day-full")
                    .addClass(dateStatus);
            });
        }
    });

    calendar.render();

    // Link up the slider with the thickness slider
});
