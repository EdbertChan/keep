import json

from backend.db import user_or_organization

from django.conf.urls import url
from django.http import HttpResponse

from tastypie.authentication import MultiAuthentication, SessionAuthentication, Authentication
from tastypie.http import HttpUnauthorized, HttpNotFound
from tastypie.resources import ModelResource
from tastypie.utils.mime import build_content_type

from repos.models import Repository, RepoSerializer
from openrosa.serializer import XFormSerializer
from openrosa.json_xls_convert import jsonXlsConvert

from .authentication import ApiTokenAuthentication
from .authorization import RepoAuthorization


class RepoResource( ModelResource ):

    class Meta:
        queryset = Repository.objects.all()
        resource_name = 'repos'

        list_allowed_methods = [ 'get' ]
        detail_allowed_methods = [ 'get', 'post', 'patch' ]

        excludes = [ 'mongo_id' ]

        # Only return JSON & XForm xml
        serializer = XFormSerializer()

        # Ensure we have an API token before returning any data.
        # TODO: Make sure this API token concept works with public/private
        # data.
        #authentication = MultiAuthentication( SessionAuthentication(), ApiTokenAuthentication() )
        authenication = Authentication()

        # TODO: Authorize based on sharing preferences.
        authorization = RepoAuthorization()

        # Don't include resource uri
        include_resource_uri = False

        filtering = {
            'study': ( 'exact', )
        }

    def prepend_urls(self):

        base_url = '^(?P<resource_name>%s)/' % ( self._meta.resource_name )

        return [

            url( regex=r"%s(?P<mongo_id>\w+)/$" % ( base_url ),
                 view=self.wrap_view('dispatch_detail'),
                 name="api_dispatch_detail"),

            url( regex=r"%s(?P<mongo_id>\w+)/manifest/$" % ( base_url ),
                 view=self.wrap_view('get_manifest'),
                 name="api_get_resource"),
        ]

    def build_filters( self, filters=None ):
        orm_filters = super( RepoResource, self ).build_filters( filters )

        if filters is None:
            return orm_filters

        if 'study' in filters and len( filters.get( 'study' ) ) > 0:
            orm_filters[ 'study' ] = filters.get( 'study' )[0]

        return orm_filters

    def create_response( self, request, data, response_class=HttpResponse, **response_kwargs):
        """
        Extracts the common "which-format/serialize/return-response" cycle.

        Mostly a useful shortcut/hook.
        """
        desired_format = self.determine_format(request)

        serialized = self.serialize(request, data, desired_format)
        
        # if its a XLSX file, the response has already been handled in json_xls_convert
        if desired_format == 'application/vnd.ms-excel':
            return serialized

        response = response_class( content=serialized,
                                   content_type=build_content_type(desired_format),
                                   **response_kwargs )
        # FOR ODKCollect
        # If the device requests an xform add an OpenRosa header
        if desired_format == 'text/xml':
            response[ 'X-OpenRosa-Version'] = '1.0'
        return response

    def dehydrate( self, bundle ):
        '''
            Serialize the current bundle.object using the RepoSerializer which
            converts the model into a JSON compatible python dictionary.

            - fields:
                Fields are grabbed from MongoDB and appended to the bundle
                dictionary.
        '''
        # First serialize the repo metadata.
        serializer = RepoSerializer()
        bundle.data = serializer.serialize( [bundle.obj] )[0]
        bundle.data[ 'children' ] = bundle.obj.fields()

        return bundle

    def _grab_media( self, root ):

        media = []
        for field in root:
            if 'children' in field:
                media.extend( self._grab_media( field[ 'children' ] ) )
                continue

            if 'choices' in field:
                for choice in field[ 'choices' ]:
                    if 'media' in choice:
                        media.extend( choice[ 'media' ].values() )

            if 'media' in field:
                media.extend( field[ 'media' ].values() )

        return media

    def get_manifest( self, request, **kwargs ):
        base = 'http://s3.amazonaws.com/keep-media/%s/%s'

        bundle = self.build_bundle( request=request )
        obj = self.obj_get( bundle, **self.remove_api_resource_names(kwargs) )

        media = list( set( self._grab_media( obj.fields() ) ) )
        media = [ ( med, base % ( obj.mongo_id, med ) ) for med in media ]

        response = { 'repo': obj.mongo_id, 'manifest': media }
        return self.create_response( request, response )

    def patch_detail( self, request, **kwargs ):
        '''
            API call to edit a repo. This API call is (at the moment) only
            allowed to change repo details such as name/description/study etc.
        '''

        fields_to_update = json.loads( request.body )

        bundle = self.build_bundle( request=request )
        repo = self.obj_get( bundle, **self.remove_api_resource_names( kwargs ) )

        try:
            if 'study' in fields_to_update:
                repo.study_id = fields_to_update[ 'study' ]

            repo.save()
        except Exception as e:
            response_data = { 'success': False, 'error': str( e ) }
            return self.create_response( request, response_data )

        response_data = { 'success': True, 'patched': repo.id }
        return self.create_response( request, response_data )

    def post_detail( self, request, **kwargs ):

        #basic_bundle = self.build_bundle( request=request )

        user_accessing = request.GET.get( 'user', None )
        user = user_or_organization( user_accessing )
        if user is None:
            return HttpUnauthorized()

        repo = Repository.objects.get( mongo_id=kwargs.get( 'mongo_id' ) )
        if repo is None:
            return HttpNotFound()

        if not user.has_perm( 'add_data', repo ):
            return HttpUnauthorized()

        new_id = repo.add_data( request.POST, request.FILES )

        response_data = { 'success': True, 'id': str( new_id ) }
        return self.create_response( request, response_data )

