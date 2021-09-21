from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.http import HttpResponse, HttpResponseNotAllowed
from django.core.serializers import serialize
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie

from .models import Block, Span, Category
import json, csv, io, pytz
from datetime import datetime


def parse_event_json(event_dict, categories):
    if 'completed' in event_dict and event_dict['completed']:
        event_dict['completed'] = True
    else:
        event_dict['completed'] = False

    if 'category' in event_dict and event_dict['category']:
        event_dict['category'] = categories.get(name=event_dict['category'])

    if event_dict['entry_type'] in ['Event', 'Record']:
        event_dict['timelocked'] = True
        event_dict['autocomplete'] = True

    del event_dict['entry_type']

    if 'start' in event_dict and event_dict['start']:
        try:
            event_dict['start'] = datetime.strptime(event_dict['start'], "%m/%d/%Y %I:%M%p")
            event_dict['end'] = datetime.strptime(event_dict['end'], "%m/%d/%Y %I:%M%p")
        except ValueError:
            event_dict['start'] = datetime.strptime(event_dict['start'], "%Y-%m-%d %H:%M:%S %z")
            event_dict['end'] = datetime.strptime(event_dict['end'], "%Y-%m-%d %H:%M:%S %z")

    if 'due' in event_dict and event_dict['due']:
        try:
            event_dict['due'] = datetime.strptime(event_dict['due'], "%m/%d/%Y %I:%M%p")
        except ValueError:
            event_dict['due'] = datetime.strptime(event_dict['due'], "%Y-%m-%d %H:%M:%S %z")

    for key in list(event_dict):
        if event_dict[key] == "":
            del event_dict[key]
    return event_dict


@login_required
def bulk_upload(request):
    if request.method == "POST":
        upload = request.FILES['filename']
        print(upload)
        dr = csv.DictReader(io.TextIOWrapper(upload, encoding="ascii"))
        timezone = pytz.timezone("US/Pacific")
        owner = request.user.paugprofile
        print(owner)
        categories = Category.objects.filter(owner=request.user.paugprofile)
        for row_orig in dr:
            event_dict = parse_event_json(dict(row_orig), categories)
            # parsed data should be converted to the uploader's chosen time-zone.
            # hack it: it should be UTC-7
            if 'start' in event_dict:
                event_dict['start'] = timezone.localize(event_dict['start'])
                event_dict['end'] = timezone.localize(event_dict['end'])
            if 'due' in event_dict:
                event_dict['due'] = timezone.localize(event_dict['due'])
            b = Block(owner=owner, **event_dict)
            b.save()

    return render(request, "paugapp/bulk_upload.html")


@login_required
def block(request):
    print(request.user.is_authenticated)
    # TODO: filter by date / time
    # if it's a get,
    if request.method == "GET":
        qs = Block.objects.filter(owner=request.user.paugprofile).exclude(start__isnull=True)
        data = serialize("json", qs, fields=('name', 'start', 'end', 'category', 'autocomplete', 'completed'))
        return HttpResponse(data, content_type="application/json")
    # return the right values filtered correctly.
    # if it's a post:
    if request.method == "POST":
        # parse the request.body
        event_dict = parse_event_json(
            dict(json.loads(request.body)),
            Category.objects.filter(owner=request.user.paugprofile)
        )
        print(event_dict)
        b = Block(owner=request.user.paugprofile, **event_dict)
        b.save()
        data = serialize("json", [b], fields=('name', 'start', 'end', 'category', 'autocomplete', 'completed'))
        return HttpResponse(data, content_type="application/json")
    # create the new object
    # if it's a put
    if request.method == "PUT":
        # 404 if not found!!
        # gotta update something.
        update_json = json.loads(request.body)
        event_dict = parse_event_json(
            dict(update_json["fields"]),
            Category.objects.filter(owner=request.user.paugprofile)
        )
        b = Block.objects.get(pk=update_json['pk'])
        if b.owner == request.user.paugprofile:
            for prop in event_dict:
                setattr(b, prop, event_dict[prop])
            b.save()
        # unauthorized.
        # TODO: different errors if auth or not.
        return HttpResponse()
    # if it's a delete
    if request.method == "DELETE":
        update_json = json.loads(request.body)
        b = Block.objects.get(pk=update_json['pk'])
        if b.owner == request.user.paugprofile:
            b.delete()
        # unauthorized.
        # TODO: different errors if auth or not.
        return HttpResponse()
    return HttpResponseNotAllowed(['GET', 'POST', 'PUT', 'DELETE'])


@login_required
def index(request):
    return render(request, "paugapp/index.html")
